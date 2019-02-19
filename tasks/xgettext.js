/*
 * grunt-gettext
 * https://github.com/arendjr/grunt-gettext
 *
 * Copyright (c) 2013 Arend van Beelen, Speakap BV
 * Licensed under the MIT license.
 */


const path = require('path');

module.exports = function (grunt) {
  const _ = grunt.util._;

  function escapeString(string) {
    return `"${string.replace(/"/g, '\\"')}"`;
  }

  function mergeTranslationNamespaces(destination, source) {
    _.each(source, (aNamespace, namespaceName) => {
      destination[namespaceName] = _.extend(destination[namespaceName] || {}, aNamespace);
    });
    return destination;
  }

  /**
   * Get all messages of a content
   * @param  {String} content            content on which extract gettext calls
   * @param  {Regex} regex               first level regex
   * @param  {Regex} subRE               second level regex
   * @param  {Regex} quoteRegex          regex for quotes
   * @param  {String} quote              quote: " or '
   * @param  {Object} options            task options
   * @param  {String} fileName           the source file of these messages
   * @param  {Object} messageToFilesMap  the map to keep track of what messages come from where
   * @return {Object}                    messages in a JS pot alike
   *                                    {
     *                                        singularKey: {
     *                                            singular: singularKey,
     *                                            plural: pluralKey,     // present only if plural
     *                                            message: ""
     *
     *                                        },
     *                                        ...
     *                                  }
   */
  function getMessages({
    content,
    regex,
    subRE,
    quoteRegex,
    quote,
    options,
    fileName,
    messageToFilesMap,
  }) {
    let currentNamespace;
    const allNamespaces = {
      messages: {},
    };
    let result = regex.exec(content);
    while (result !== null) {
      const strings = result[1];
      let singularKey;
      result = subRE.exec(strings);
      while (result !== null) {
        let keyIndex = 1;
        currentNamespace = allNamespaces.messages;
        let currentNamespaceString = 'messages';

        if (result.length === 3) {
          if (result[1] === undefined) {
            currentNamespace = allNamespaces.messages;
          } else {
            if (allNamespaces[result[1]] === undefined) {
              allNamespaces[result[1]] = {};
            }
            currentNamespace = allNamespaces[result[1]];
            currentNamespaceString = result[1];
          }
          keyIndex = 2;
        }
        const string = options.processMessage(result[keyIndex].replace(quoteRegex, quote));

        // if singular form already defined add message as plural
        if (typeof singularKey !== 'undefined') {
          currentNamespace[singularKey].plural = string;
          // if not defined init message object
        } else {
          singularKey = string;
          currentNamespace[singularKey] = {
            singular: string,
            message: '',
          };
        }
        if (!messageToFilesMap[currentNamespaceString]) {
          messageToFilesMap[currentNamespaceString] = {};
        }
        if (messageToFilesMap[currentNamespaceString][singularKey] &&
            !_.contains(messageToFilesMap[currentNamespaceString][singularKey], fileName)) {
          messageToFilesMap[currentNamespaceString][singularKey].push(fileName);
        } else if (!messageToFilesMap[currentNamespaceString][singularKey]) {
          messageToFilesMap[currentNamespaceString][singularKey] = [fileName];
        }
        result = subRE.exec(strings);
      }
      result = regex.exec(content);
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
    const messageRE = /(^#[:.,~|\s]\s?|^msgid\s"|^msgstr\s"|^"|"$)?/g;
    function clean(s) {
      return s.replace(messageRE, '').replace(/\\"/g, '"');
    }

    let curMsgid = 0;
    let curSection = '';
    const output = {
      msgid: [],
      msgstr: [],
    };

    const lines = str.split('\n');
    lines.forEach((line) => {
      if (line.substr(0, 6) === 'msgid ') {
        // untranslated-string
        curSection = 'msgid';
        output.msgid[curMsgid] = clean(line);
      } else if (line.substr(0, 6) === 'msgstr') {
        // translated-string
        curSection = 'msgstr';
        output.msgstr[curMsgid] = clean(line);
      } else if (line.substr(0, 1) === '"') {
        // continuation
        output[curSection][curMsgid] += clean(line);
      } else if (line.trim() === '') {
        curMsgid += 1;
      }
    });
    return output;
  }

  function updatePoFromPot(potFolderPath, namespace) {
    const potFilename = path.resolve(potFolderPath, `${namespace}.pot`);
    const poFilename = path.resolve(potFolderPath, `${namespace}-en.po`);

    const potContents = grunt.file.read(potFilename);
    const pot = parseIntoArray(potContents);

    const poContents = grunt.file.read(poFilename);
    const po = parseIntoArray(poContents);

    const newMsgids = [];
    // add new resources into po first
    for (let i = 0; i < pot.msgid.length; i += 1) {
      if (_.indexOf(po.msgid, pot.msgid[i]) === -1) {
        newMsgids.push(pot.msgid[i]);
      }
    }

    let sortedIndex = po.msgid.length;
    for (let i = 0; i < newMsgids.length; i += 1) {
      sortedIndex = _.sortedIndex(po.msgid, newMsgids[i]);
      po.msgid.splice(sortedIndex, 0, newMsgids[i]);
      po.msgstr.splice(sortedIndex, 0, newMsgids[i]);
    }

    // remove resources from po next
    const removedMsgids = [];
    // exclude the first id and str to preserve the po header
    for (let i = 1; i < po.msgid.length; i += 1) {
      if (_.indexOf(pot.msgid, po.msgid[i]) === -1) {
        removedMsgids.push(po.msgid[i]);
      }
    }

    for (let i = 0; i < removedMsgids.length; i += 1) {
      const index = _.indexOf(po.msgid, removedMsgids[i]);
      po.msgid.splice(index, 1);
      po.msgstr.splice(index, 1);
    }

    // fail the build if the number of items in po and pot files are not the same
    if (pot.msgid.length !== (po.msgid.length - 1) || po.msgid.length !== po.msgstr.length) {
      grunt.fail.fatal(`Convert from pot file to po file failed for this namespace: ${namespace}. Please find UI team for help.`);
    }

    let buffer = '';

    for (let j = 0; j < po.msgid.length - 1; j += 1) {
      buffer += `msgid ${escapeString(po.msgid[j])}\nmsgstr ${escapeString(po.msgstr[j])}\n\n`;
    }
    buffer += `msgid ${escapeString(po.msgid[po.msgid.length - 1])}\nmsgstr ${escapeString(po.msgstr[po.msgid.length - 1])}`;

    grunt.file.write(poFilename, buffer);
  }

  const extractors = {
    angular(fileName, options) {
      const content = grunt.file.read(fileName).replace('\n', ' ');
      const fn = _.flatten([options.functionName]);
      const messages = {};
      const namespaceSeparator = options.namespaceSeparator || '.';
      const messageToFilesMap = {};

      // Extract text strings with use the filter form of the ng-i18next library.
      const extractStrings = function (quote, functionName) {
        const namespaceRegex = `(?:([\\d\\w]*)${namespaceSeparator})?`;
        const variablesRegex = '(?::\\{.*\\})?';
        const regex = new RegExp(`\\{\\{\\s*((?:\\:{0,2}\\(?${
          quote}(?:[^${quote}\\\\]|\\\\.)+${quote
        }\\s*)+)[^}]*\\s*\\|\\s*${functionName}${variablesRegex}\\)?\\s*\\}\\}`, 'g');
        const subRE = new RegExp(`${quote + namespaceRegex}((?:[^${quote}\\\\]|\\\\.)+)${quote}`, 'g');
        const quoteRegex = new RegExp(`\\\\${quote}`, 'g');

        mergeTranslationNamespaces(
          messages,
          getMessages({
            content,
            regex,
            subRE,
            quoteRegex,
            quote,
            options,
            fileName,
            messageToFilesMap,
          }),
        );
      };

      /* Text strings may also use the ng-i18next directive with a set of arguments
       * particularly to do compiled HTML
       * (<b> tags for example) in the key text.
       */
      const extractDirectiveStrings = function (quote, functionName) {
        const allNamespaces = { messages: {} };
        const regex = new RegExp(`ng-i18next=${quote}\\[html:${functionName}\\](?:\\({(?!}\\)).+}\\))?([^${quote}]+)${quote}`, 'g');
        let result;
        do {
          result = regex.exec(content);
          if (result !== null) {
            const string = result[1];
            allNamespaces.messages[string] = {
              singular: string,
              message: '',
            };
          }
        } while (result !== null);

        mergeTranslationNamespaces(messages, allNamespaces);
      };

      _.each(fn, (func) => {
        extractStrings("'", func);
        extractStrings('"', func);
        extractDirectiveStrings("'", func);
      });

      return [messages, messageToFilesMap];
    },

    handlebars(fileName, options) {
      const content = grunt.file.read(fileName).replace('\n', ' ');
      const fn = _.flatten([options.functionName]);
      const messages = {};
      const namespaceSeparator = options.namespaceSeparator || '.';
      const messageToFilesMap = {};

      const extractStrings = function (quote, functionName) {
        const namespaceRegex = `(?:([\\d\\w]*)${namespaceSeparator})?`;
        const regex = new RegExp(`\\{\\{\\s*${functionName}\\s+((?:${
          quote}(?:[^${quote}\\\\]|\\\\.)+${quote
        }\\s*)+)[^}]*\\s*\\}\\}`, 'g');
        const subRE = new RegExp(`${quote + namespaceRegex}((?:[^${quote}\\\\]|\\\\.)+)${quote}`, 'g');
        const quoteRegex = new RegExp(`\\\\${quote}`, 'g');

        mergeTranslationNamespaces(
          messages,
          getMessages({
            content,
            regex,
            subRE,
            quoteRegex,
            quote,
            options,
            fileName,
            messageToFilesMap,
          }),
        );
      };

      _.each(fn, (func) => {
        extractStrings("'", func);
        extractStrings('"', func);
      });

      return [messages, messageToFilesMap];
    },


    vue(fileName, options) {
      // vue files have two portions
      // The HTML template portion appears between <template> tags
      // and has a similar format to angular templates
      // The logic is in a <script> tag below the template,
      // and can be parsed with the javascript extractor

      const content = grunt.file.read(fileName).replace('\n', ' ');
      const fn = _.flatten([options.functionName]);
      const messages = {};
      const namespaceSeparator = options.namespaceSeparator || '.';
      const messageToFilesMap = {};

      // Extract text strings with use the filter form of the ng-i18next library.
      const extractStrings = function (quote, functionName) {
        const namespaceRegex = `(?:([\\d\\w]*)${namespaceSeparator})?`;
        const variablesRegex = '(?:\\(.*\\))?';
        const regex = new RegExp(`\\{\\{\\s*((?:\\:{0,2}\\(?${
          quote}(?:[^${quote}\\\\]|\\\\.)+${quote
        }\\s*)+)[^}]*\\s*\\|\\s*${functionName}${variablesRegex}\\)?\\s*\\}\\}`, 'g');
        const subRE = new RegExp(`${quote + namespaceRegex}((?:[^${quote}\\\\]|\\\\.)+)${quote}`, 'g');
        const quoteRegex = new RegExp(`\\\\${quote}`, 'g');

        mergeTranslationNamespaces(
          messages,
          getMessages({
            content,
            regex,
            subRE,
            quoteRegex,
            quote,
            options,
            fileName,
            messageToFilesMap,
          }),
        );
      };

      /* Text strings may also be used in directives with a set of arguments
       */
      const extractVueDirectiveStrings = function (outerQuote, quote, functionName) {
        const namespaceRegex = `(?:([\\d\\w]*)${namespaceSeparator})?`;
        const variablesRegex = '(?:\\(.*\\))?';
        const messageRegex = `(${quote}(?:[^${quote}\\\\]|\\\\.)+${quote})`;
        const regex = new RegExp(`:\\w[-\\w]*=${outerQuote}${messageRegex}\\s*\\|\\s*${functionName}${variablesRegex}\\s*${outerQuote}`, 'g');
        const subRE = new RegExp(`${quote + namespaceRegex}((?:[^${quote}\\\\]|\\\\.)+)${quote}`, 'g');
        const quoteRegex = new RegExp(`\\\\${quote}`, 'g');

        mergeTranslationNamespaces(
          messages,
          getMessages({
            content,
            regex,
            subRE,
            quoteRegex,
            quote,
            options,
            fileName,
            messageToFilesMap,
          }),
        );
      };

      // extract messages in <template></template>
      _.each(fn, (func) => {
        extractStrings("'", func);
        extractStrings('"', func);
        extractVueDirectiveStrings(`'`, `"`, func);
        extractVueDirectiveStrings(`"`, `'`, func);
      });

      // extract messages in <script></script>
      const scriptTagExtracted = extractors.javascript(fileName, options);
      const scriptTagExtractedStrings = scriptTagExtracted[0];
      const scriptTagMessageToFilesMap = scriptTagExtracted[1];
      _.each(scriptTagExtractedStrings, (aNamespace, namespaceName) => {
        if (!messageToFilesMap[namespaceName]) {
          messageToFilesMap[namespaceName] = {};
        }
        combineMessageToFilesMaps(
          messageToFilesMap[namespaceName],
          scriptTagMessageToFilesMap[namespaceName],
        );
        messages[namespaceName] = _.extend(messages[namespaceName] || {}, aNamespace);
      });

      return [messages, messageToFilesMap];
    },


    json(fileName, options) {
      const content = grunt.file.read(fileName);
      const messages = {};
      const namespaceSeparator = options.namespaceSeparator || '.';
      const messageToFilesMap = {};

      const extractStrings = function (quote) {
        const namespaceRegex = `(?:([\\d\\w]*)${namespaceSeparator})?`;
        const regex = /"((?:[\d\w]+:::)[^"]+)"/g;
        const subRE = new RegExp(`${namespaceRegex}([^${quote}]+)`, 'g');
        const quoteRegex = new RegExp(`\\\\${quote}`, 'g');

        mergeTranslationNamespaces(
          messages,
          getMessages({
            content,
            regex,
            subRE,
            quoteRegex,
            quote,
            options,
            fileName,
            messageToFilesMap,
          }),
        );
      };

      extractStrings('"');

      return [messages, messageToFilesMap];
    },

    javascript(fileName, options) {
      const content = grunt.file.read(fileName).replace('\n', ' ')
        .replace(/"\s*\+\s*"/g, '')
        .replace(/'\s*\+\s*'/g, '');

      const fn = _.flatten([options.functionName]);
      const messages = {};
      const namespaceSeparator = options.namespaceSeparator || '.';
      const messageToFilesMap = {};

      const extractStrings = function (quote, functionName) {
        const namespaceRegex = `(?:([\\d\\w]*)${namespaceSeparator})?`;
        const regex = new RegExp(`(?:[^\\w]|^)${functionName}\\s*\\(\\s*((?:${
          quote}(?:[^${quote}\\\\]|\\\\.)+${quote
        }\\s*[,)]\\s*)+)`, 'g');
        const subRE = new RegExp(`${quote + namespaceRegex}((?:[^${quote}\\\\]|\\\\.)+)${quote}`, 'g');
        const quoteRegex = new RegExp(`\\\\${quote}`, 'g');

        mergeTranslationNamespaces(
          messages,
          getMessages({
            content,
            regex,
            subRE,
            quoteRegex,
            quote,
            options,
            fileName,
            messageToFilesMap,
          }),
        );
      };

      _.each(fn, (func) => {
        extractStrings("'", func);
        extractStrings('"', func);
        extractStrings("'", `${func}_`);
        extractStrings('"', `${func}_`);
      });

      return [messages, messageToFilesMap];
    },
  };

  function combineMessageToFilesMaps(mapToModify, newMap) {
    _.each(newMap, (files, message) => {
      if (mapToModify[message]) {
        mapToModify[message] = mapToModify[message].concat(files);
      } else {
        mapToModify[message] = files;
      }
    });
  }

  function calculateDiffBetweenOldAndNewMessageIds(oldMessageIdsArray, messageToFilesMap) {
    let diff = '';
    _.each(messageToFilesMap, (files, messageId) => {
      if (!_.contains(oldMessageIdsArray, escapeString(messageId))) {
        diff += `${escapeString(messageId)} -- ${files.join(', ')}\n`;
      }
    });
    return diff;
  }

  function extractMessageIds(string) {
    const messageIds = [];
    let match = true;
    const regex = new RegExp('msgid "((.|[\\s])+?([^\\\\]))"', 'gm');
    do {
      match = regex.exec(string);
      if (match) {
        messageIds.push(match[0].slice(6));
      }
    } while (match);
    return messageIds;
  }

  function handleTranslations(options, files, potFolderPath) {
    const translations = {};
    const messageToFilesMap = {};

    files.forEach((f) => {
      if (!extractors[f.dest]) {
        console.log(`No gettext extractor for type: ${f.dest}`);
        return;
      }

      const messages = {};
      f.src.forEach((file) => {
        const newExtracted = extractors[f.dest](file, options);
        const newExtractedStrings = newExtracted[0];
        const newMessageToFilesMap = newExtracted[1];
        _.each(newExtractedStrings, (aNamespace, namespaceName) => {
          if (!messageToFilesMap[namespaceName]) {
            messageToFilesMap[namespaceName] = {};
          }
          combineMessageToFilesMaps(
            messageToFilesMap[namespaceName],
            newMessageToFilesMap[namespaceName],
          );
          messages[namespaceName] = _.extend(messages[namespaceName] || {}, aNamespace);
        });
      });

      mergeTranslationNamespaces(translations, messages);
    });
    const errors = [];
    _.each(translations, (aNamespace, namespaceName) => {
      const filename = path.resolve(options.potPath, `${namespaceName}.pot`);

      if (!grunt.option('fix')) {
        const existingString = grunt.file.read(filename);
        const existingMessageIds = extractMessageIds(existingString);
        const diff = calculateDiffBetweenOldAndNewMessageIds(
          existingMessageIds,
          messageToFilesMap[namespaceName],
        );
        if (diff) {
          errors.push(diff);
        }
      } else {
        let contents = '';

        const sortedKeys = Object.keys(aNamespace).sort();

        contents += _.map(sortedKeys, (aKey) => {
          const definition = aNamespace[aKey];
          let buffer = `msgid ${escapeString(definition.singular)}\n`;
          if (definition.plural) {
            buffer += `msgid_plural ${escapeString(definition.plural)}\n`;
            buffer += `msgstr[0] ${escapeString(definition.message)}\n`;
          } else {
            buffer += `msgstr ${escapeString(definition.message)}\n`;
          }
          return buffer;
        }).join('\n');
        grunt.file.write(filename, contents, {});
        updatePoFromPot(potFolderPath, namespaceName);
      }
    });
    if (errors.length) {
      grunt.fail.fatal(`It appears that you have js resource changes not yet updated in po and pot files. Please run 'grunt xgettext --fix'. The diff is:\n${errors.join('\n')}`);
    }
  }

  grunt.registerMultiTask('xgettext', 'Extracts translatable messages', function () {
    const options = this.options({
      functionName: 'tr',
      processMessage: _.identity,
      potPath: '.',
    });
    handleTranslations(options, this.files, './project/translations');
  });

  grunt.registerMultiTask('xgettextKingsschool', 'Extracts translatable messages for kingsschool project', function () {
    const options = this.options({
      functionName: 'tr',
      processMessage: _.identity,
      potPath: '.',
    });
    handleTranslations(options, this.files, './project/kingsschool/translations');
  });
};
