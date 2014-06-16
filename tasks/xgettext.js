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
          var regex = new RegExp("\\{\\{\\s*((?:" +
            quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
            "\\s*)+)[^}]*\\s*\\|\\s*" + fn + variablesRegex + "\\s*\\}\\}", "g");
          var subRE = new RegExp(quote + namespaceRegex + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
          var quoteRegex = new RegExp("\\\\" + quote, "g");

          mergeTranslationNamespaces(messages, getMessages(contents, regex, subRE, quoteRegex, quote, options));
        };

        // Text strings may also use the ng-i18next directive with a set of arguments - particularly to do compiled HTML
        // (<b> tags for example) in the key text.
        var extractDirectiveStrings = function(quote, fn) {
          var allNamespaces = { messages : {}};
          var regex = new RegExp('ng-i18next=' + quote + '\\[html:' + fn + '\\]\\([^\\)]+\\)([^' + quote + ']+)' + quote, "g");
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

        javascript: function(file, options) {
            var contents = grunt.file.read(file).replace("\n", " ")
                .replace(/"\s*\+\s*"/g, "")
                .replace(/'\s*\+\s*'/g, "");

            var fn = _.flatten([ options.functionName ]),
                messages = {};

            var extractStrings = function(quote, fn) {
                var regex = new RegExp("(?:[^\\w]|^)" + fn + "\\s*\\(\\s*((?:" +
                    quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
                    "\\s*[,)]\\s*)+)", "g");
                var subRE = new RegExp(quote + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
                var quoteRegex = new RegExp("\\\\" + quote, "g");

              mergeTranslationNamespaces(messages, getMessages(contents, regex, subRE, quoteRegex, quote, options));
            };

            _.each(fn, function(func) {
                extractStrings("'", func);
                extractStrings('"', func);
            });

            return messages;
        }
    };

    grunt.registerMultiTask("xgettext", "Extracts translatable messages", function() {

        var options = this.options({
            functionName: "tr",
            processMessage: _.identity,
            potPath: '.'
        });

        var translations = {};

        this.files.forEach(function(f) {

            if (!extractors.hasOwnProperty(f.dest)) {
                console.log("No gettext extractor for type: " + f.dest);
                return;
            }

            var messages = {};
            f.src.forEach(function(file) {
              var newExtractedStrings = extractors[f.dest](file, options);
              _.each(newExtractedStrings, function(aNamespace, namespaceName) {
//                grunt.log.writeln("Extracted " + Object.keys(aNamespace).length + " messages in " + namespaceName + " from " + file);
                messages[namespaceName] = _.extend(messages[namespaceName] || {}, aNamespace);
              });
            });

          mergeTranslationNamespaces(translations, messages);

          _.each(messages, function(aNamespace, namespaceName) {
            var count = Object.keys(aNamespace).length;
            grunt.log.writeln("Extracted " + count + " messages in " + namespaceName + " from " + f.dest + " files.");
          })
        });

      _.each(translations, function(aNamespace, namespaceName) {
        var contents = "# Generated by grunt-xgettext on " + (new Date()).toString() + "\n\n";

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
        grunt.file.write(filename, contents);

        var count = Object.keys(aNamespace).length;
        grunt.log.writeln(count + " unique messages successfully extracted, " +
          filename + " written.");
      });
    });

};
