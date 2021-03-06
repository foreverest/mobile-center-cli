/*
 * Code generated by Microsoft (R) AutoRest Code Generator 0.17.0.0
 * Changes may cause incorrect behavior and will be lost if the code is
 * regenerated.
 */

'use strict';

/**
 * @class
 * Initializes a new instance of the AndroidBranchConfigurationProperties class.
 * @constructor
 * Build configuration for Android projects
 *
 * @member {string} [gradleWrapperPath] Path to the Gradle wrapper script
 * 
 * @member {string} module The Gradle module to build
 * 
 * @member {string} buildVariant The Android build variant to build
 * 
 * @member {boolean} [runTests] Whether to run unit tests during the build
 * (default). Default value: true .
 * 
 * @member {boolean} [runLint] Whether to run lint checks during the build
 * (default). Default value: true .
 * 
 */
function AndroidBranchConfigurationProperties() {
}

/**
 * Defines the metadata of AndroidBranchConfigurationProperties
 *
 * @returns {object} metadata of AndroidBranchConfigurationProperties
 *
 */
AndroidBranchConfigurationProperties.prototype.mapper = function () {
  return {
    required: false,
    serializedName: 'AndroidBranchConfigurationProperties',
    type: {
      name: 'Composite',
      className: 'AndroidBranchConfigurationProperties',
      modelProperties: {
        gradleWrapperPath: {
          required: false,
          serializedName: 'gradleWrapperPath',
          type: {
            name: 'String'
          }
        },
        module: {
          required: true,
          serializedName: 'module',
          type: {
            name: 'String'
          }
        },
        buildVariant: {
          required: true,
          serializedName: 'buildVariant',
          type: {
            name: 'String'
          }
        },
        runTests: {
          required: false,
          serializedName: 'runTests',
          defaultValue: true,
          type: {
            name: 'Boolean'
          }
        },
        runLint: {
          required: false,
          serializedName: 'runLint',
          defaultValue: true,
          type: {
            name: 'Boolean'
          }
        }
      }
    }
  };
};

module.exports = AndroidBranchConfigurationProperties;
