/*
 * grunt-gettext
 * https://github.com/arendjr/grunt-gettext
 *
 * Copyright (c) 2013 Arend van Beelen, Speakap BV
 * Licensed under the MIT license.
 */

"use strict";
var path = require('path');

module.exports = function(grunt) {

  var _ = grunt.util._;

  function escapeString(string) {

    return '"' + string.replace(/"/g, '\\"') + '"';
  }

  function mergeTranslationNamespaces(destination, source) {
    _.each(source, function(aNamespace, namespaceName) {
      destination[namespaceName] = _.extend(destination[namespaceName] || {}, aNamespace);
    });
    return destination;
  }

  /**
   * Get all messages of a content
   * @param  {String} content     content on which extract gettext calls
   * @param  {Regex} regex        first level regex
   * @param  {Regex} subRE        second level regex
   * @param  {Regex} quoteRegex   regex for quotes
   * @param  {String} quote       quote: " or '
   * @param  {Object} options     task options
   * @return {Object}             messages in a JS pot alike
   *                                       {
     *                                           singularKey: {
     *                                               singular: singularKey,
     *                                               plural: pluralKey,     // present only if plural
     *                                               message: ""
     *
     *                                           },
     *                                           ...
     *                                       }
   */
  function getMessages(content, regex, subRE, quoteRegex, quote, options) {
    var messages = {}, result, currentNamespace;
    var allNamespaces = {
      messages: {}
    };
    while ((result = regex.exec(content)) !== null) {
      var strings = result[1],
        singularKey = void 0;

      while ((result = subRE.exec(strings)) !== null) {
        var keyIndex = 1;
        currentNamespace = allNamespaces.messages;

        if (result.length === 3) {
          if (result[1] === undefined) {
            currentNamespace = allNamespaces.messages;
          } else {
            if (allNamespaces[result[1]] === undefined) {
              allNamespaces[result[1]] = {};
            }
            currentNamespace = allNamespaces[result[1]];
          }
          keyIndex = 2;
        }
        var string = options.processMessage(result[keyIndex].replace(quoteRegex, quote));

        // if singular form already defined add message as plural
        if (typeof singularKey !== 'undefined') {
          currentNamespace[singularKey].plural = string;
          // if not defined init message object
        } else {
          singularKey = string;
          currentNamespace[singularKey] = {
            singular: string,
            message: ""
          };
        }
      }
    }
    return allNamespaces;
  }

  /**
   * This method based on:
   *
   * gettext.js ( http://code.google.com/p/gettext-js/ )
   *
   * @author     Maxime Haineault, 2007 (max@centdessin.com)
   * @version    0.1.0
   * @licence    M.I.T
   */
  function parseIntoArray(str) {
    var messageRE = /(^#[\:\.,~|\s]\s?|^msgid\s"|^msgstr\s"|^"|"$)?/g;
    function clean(str) {
      return str.replace(messageRE, "").replace(/\\"/g, '"');
    }

    var curMsgid = 0;
    var curSection = "";
    var output = {
      msgid: [],
      msgstr: []
    };

    var lines = str.split("\n");
    lines.forEach(function(line) {
      if (line.substr(0, 6) === "msgid ") {
        // untranslated-string
        curSection = "msgid";
        output.msgid[curMsgid] = clean(line);
      } else if (line.substr(0, 6) === "msgstr") {
        // translated-string
        curSection = "msgstr";
        output.msgstr[curMsgid] = clean(line);
      } else if (line.substr(0, 1) === '"') {
        // continuation
        output[curSection][curMsgid] += clean(line);
      } else if (line.trim() === "") {
        curMsgid++;
      }
    });
    return output;
  }

  function updatePoFromPot(potFolderPath, namespace) {

    var potFilename = path.resolve(potFolderPath, namespace + ".pot");
    var poFilename = path.resolve(potFolderPath, namespace + "-en.po");

    var potContents = grunt.file.read(potFilename);
    var pot = parseIntoArray(potContents);

    var poContents = grunt.file.read(poFilename);
    var po = parseIntoArray(poContents);

    var newMsgids = [];
    // add new resources into po first
    for (var i = 0; i < pot.msgid.length; i++) {
      if (_.indexOf(po.msgid, pot.msgid[i]) === -1) {
        newMsgids.push(pot.msgid[i]);
      }
    }

    var sortedIndex = po.msgid.length;
    for (i = 0; i < newMsgids.length; i++) {
      sortedIndex = _.sortedIndex(po.msgid, newMsgids[i]);
      po.msgid.splice(sortedIndex, 0, newMsgids[i]);
      po.msgstr.splice(sortedIndex, 0, newMsgids[i]);
    }

    // remove resources from po next
    var removedMsgids = [];
    // exclude the first id and str to preserve the po header
    for (i = 1; i < po.msgid.length; i++) {
      if (_.indexOf(pot.msgid, po.msgid[i]) === -1) {
        removedMsgids.push(po.msgid[i]);
      }
    }

    for (i = 0; i < removedMsgids.length; i++) {
      var index = _.indexOf(po.msgid, removedMsgids[i]);
      po.msgid.splice(index, 1);
      po.msgstr.splice(index, 1);
    }

    // fail the build if the number of items in po and pot files are not the same
    if (pot.msgid.length !== (po.msgid.length - 1) || po.msgid.length !== po.msgstr.length) {
      grunt.fail.fatal("Convert from pot file to po file failed for this namespace: " + namespace + ". Please find UI team for help.");
    }

    var buffer = '';

    for (var j = 0; j < po.msgid.length - 1; j++) {
      buffer += 'msgid ' + escapeString(po.msgid[j]) + '\n' + 'msgstr ' + escapeString(po.msgstr[j]) + '\n\n';
    }
    buffer += 'msgid ' + escapeString(po.msgid[po.msgid.length - 1]) + '\n' + 'msgstr ' + escapeString(po.msgstr[po.msgid.length - 1]);

    grunt.file.write(poFilename, buffer);
  }

  var extractors = {
    angular: function(file, options) {
      var contents = grunt.file.read(file).replace("\n", " "),
        fn = _.flatten([ options.functionName ]),
        messages = {},
        namespaceSeparator = options.namespaceSeparator || '.';

      // Extract text strings with use the filter form of the ng-i18next library.
      var extractStrings = function(quote, fn) {
        var namespaceRegex = "(?:([\\d\\w]*)" + namespaceSeparator + ")?";
        var variablesRegex = "(?::\\{.*\\})?";
        var regex = new RegExp("\\{\\{\\s*((?:\\:{0,2}\\(?" +
                               quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
                               "\\s*)+)[^}]*\\s*\\|\\s*" + fn + variablesRegex + "\\)?\\s*\\}\\}", "g");
        var subRE = new RegExp(quote + namespaceRegex + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
        var quoteRegex = new RegExp("\\\\" + quote, "g");

        mergeTranslationNamespaces(messages, getMessages(contents, regex, subRE, quoteRegex, quote, options));
      };

      // Text strings may also use the ng-i18next directive with a set of arguments - particularly to do compiled HTML
      // (<b> tags for example) in the key text.
      var extractDirectiveStrings = function(quote, fn) {
        var allNamespaces = { messages : {}};
        var regex = new RegExp('ng-i18next=' + quote + '\\[html:' + fn + '\\](?:\\({(?!}\\)).+}\\))?([^' + quote + ']+)' + quote, "g");
        var result;
        while ((result = regex.exec(contents)) !== null) {
          var string = result[1];
          allNamespaces.messages[string] = {
            singular: string,
            message: ""
          };
        }

        mergeTranslationNamespaces(messages, allNamespaces);
      };

      _.each(fn, function(func) {
        extractStrings("'", func);
        extractStrings('"', func);
        extractDirectiveStrings("'", func);
        extractDirectiveStrings('"', func);
      });

      return messages;
    },

    handlebars: function(file, options) {
      var contents = grunt.file.read(file).replace("\n", " "),
        fn = _.flatten([ options.functionName ]),
        messages = {},
        namespaceSeparator = options.namespaceSeparator || '.';

      var extractStrings = function(quote, fn) {
        var namespaceRegex = "(?:([\\d\\w]*)" + namespaceSeparator + ")?";
        var regex = new RegExp("\\{\\{\\s*" + fn + "\\s+((?:" +
                               quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
                               "\\s*)+)[^}]*\\s*\\}\\}", "g");
        var subRE = new RegExp(quote + namespaceRegex + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
        var quoteRegex = new RegExp("\\\\" + quote, "g");

        mergeTranslationNamespaces(messages, getMessages(contents, regex, subRE, quoteRegex, quote, options));
      };

      _.each(fn, function(func) {
        extractStrings("'", func);
        extractStrings('"', func);
      });

      return messages;
    },

    json: function(file, options) {
      var contents = grunt.file.read(file),
        messages = {},
        namespaceSeparator = options.namespaceSeparator || '.';

      var extractStrings = function(quote) {
        var namespaceRegex = "(?:([\\d\\w]*)" + namespaceSeparator + ")?";
        var regex = /"((?:[\d\w]+:::)[^"]+)"/g;
        var subRE = new RegExp(namespaceRegex + "([^" + quote + "]+)", "g");
        var quoteRegex = new RegExp("\\\\" + quote, "g");

        mergeTranslationNamespaces(messages, getMessages(contents, regex, subRE, quoteRegex, quote, options));
      };

      extractStrings('"');

      return messages;
    },

    javascript: function(file, options) {
      var contents = grunt.file.read(file).replace("\n", " ")
        .replace(/"\s*\+\s*"/g, "")
        .replace(/'\s*\+\s*'/g, "");

      var fn = _.flatten([ options.functionName ]),
        messages = {},
        namespaceSeparator = options.namespaceSeparator || '.';

      var extractStrings = function(quote, fn) {
        var namespaceRegex = "(?:([\\d\\w]*)" + namespaceSeparator + ")?";
        var regex = new RegExp("(?:[^\\w]|^)" + fn + "\\s*\\(\\s*((?:" +
                               quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
                               "\\s*[,)]\\s*)+)", "g");
        var subRE = new RegExp(quote + namespaceRegex + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
        var quoteRegex = new RegExp("\\\\" + quote, "g");

        mergeTranslationNamespaces(messages, getMessages(contents, regex, subRE, quoteRegex, quote, options));
      };

      _.each(fn, function(func) {
        extractStrings("'", func);
        extractStrings('"', func);
        extractStrings("'", func + "_");
        extractStrings('"', func + "_");
      });

      return messages;
    }
  };

  function handleTranslations(options, files, potFolderPath) {

    var translations = {};

    files.forEach(function(f) {

      if (!extractors.hasOwnProperty(f.dest)) {
        console.log("No gettext extractor for type: " + f.dest);
        return;
      }

      var messages = {};
      f.src.forEach(function(file) {
        var newExtractedStrings = extractors[f.dest](file, options);
        _.each(newExtractedStrings, function(aNamespace, namespaceName) {
          messages[namespaceName] = _.extend(messages[namespaceName] || {}, aNamespace);
        });
      });

      mergeTranslationNamespaces(translations, messages);

      _.each(messages, function(aNamespace, namespaceName) {
        var count = Object.keys(aNamespace).length;
      })
    });

    _.each(translations, function(aNamespace, namespaceName) {
      var contents = "";

      var sortedKeys = Object.keys(aNamespace).sort();

      contents += _.map(sortedKeys, function (aKey) {
        var definition = aNamespace[aKey];
        var buffer = "msgid " + escapeString(definition.singular) + "\n";
        if (definition.plural) {
          buffer += "msgid_plural " + escapeString(definition.plural) + "\n";
          buffer += "msgstr[0] " + escapeString(definition.message) + "\n";
        } else {
          buffer += "msgstr " + escapeString(definition.message) + "\n";
        }
        return buffer;
      }).join("\n");

      var filename = path.resolve(options.potPath, namespaceName + ".pot");

      if (!grunt.option('fix')) {
        var existingResources = grunt.file.read(filename);
        if (contents !== existingResources) {
          grunt.fail.fatal("It appears that you have js resource changes not yet updated in po and pot files. Please run 'grunt xgettext --fix'");
        }
      } else {
        grunt.file.write(filename, contents, {});
        updatePoFromPot(potFolderPath, namespaceName);
      }
    });
  }

  grunt.registerMultiTask("xgettext", "Extracts translatable messages", function() {
    var options = this.options({
      functionName: "tr",
      processMessage: _.identity,
      potPath: '.'
    });
    handleTranslations(options, this.files, './project/translations');
  });

  grunt.registerMultiTask("xgettextKingsschool", "Extracts translatable messages for kingsschool project", function() {
    var options = this.options({
      functionName: "tr",
      processMessage: _.identity,
      potPath: '.'
    });
    handleTranslations(options, this.files, './project/kingsschool/translations');
  });
};
