/*
 * grunt-gettext
 * https://github.com/arendjr/grunt-gettext
 *
 * Copyright (c) 2013 Arend van Beelen, Speakap BV
 * Licensed under the MIT license.
 */

"use strict";

module.exports = function(grunt) {

    grunt.initConfig({
        xgettext: {
            default_options: {
                options: {
                    functionName: ["tr", "i18next", , "i18nextEager"],
                    namespaceSeparator: "::",
                    potFile: "messages.pot"
                },

                files: {
                    handlebars: ["assets/*.handlebars"],
                    javascript: ["assets/*.js"],
                    vue: ["assets/*.vue"],
                    angular: ["assets/*.html"]
                }
            }
        }

    });

    grunt.loadTasks("../tasks");

    grunt.registerTask("default", ["xgettext"]);

};
