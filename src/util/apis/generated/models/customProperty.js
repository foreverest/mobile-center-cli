/*
 * Code generated by Microsoft (R) AutoRest Code Generator 0.17.0.0
 * Changes may cause incorrect behavior and will be lost if the code is
 * regenerated.
 */

'use strict';

/**
 * @class
 * Initializes a new instance of the CustomProperty class.
 * @constructor
 * @member {string} name
 * 
 * @member {string} type Polymorhpic Discriminator
 * 
 */
function CustomProperty() {
}

/**
 * Defines the metadata of CustomProperty
 *
 * @returns {object} metadata of CustomProperty
 *
 */
CustomProperty.prototype.mapper = function () {
  return {
    required: false,
    serializedName: 'CustomProperty',
    type: {
      name: 'Composite',
      polymorphicDiscriminator: 'type',
      uberParent: 'CustomProperty',
      className: 'CustomProperty',
      modelProperties: {
        name: {
          required: true,
          serializedName: 'name',
          constraints: {
            MaxLength: 128,
            Pattern: '^[a-zA-Z][a-zA-Z0-9]*$'
          },
          type: {
            name: 'String'
          }
        },
        type: {
          required: true,
          serializedName: 'type',
          type: {
            name: 'String'
          }
        }
      }
    }
  };
};

module.exports = CustomProperty;
