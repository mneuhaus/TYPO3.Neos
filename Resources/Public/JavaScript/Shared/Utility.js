/**
 * A set of utility functions
 */
define(
[
	'emberjs'
],
function(Ember) {
	/**
	 * @singleton
	 */
	return Ember.Object.extend({
		/**
		 * The following regular expression comes from http://tools.ietf.org/html/rfc4627 and checks if the JSON is valid
		 *
		 * @param {string} jsonString
		 * @return {boolean}
		 */
		isValidJsonString: function(jsonString) {
			return !/[^,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]/.test(jsonString.replace(/"(\\.|[^"\\])*"/g, ''));
		},

		/**
		 * Checks if the given value is a valid link
		 *
		 * @param value
		 * @returns {boolean}
		 */
		isValidLink: function(value) {
			return this.isLocalUrl(value) || this.isInnerDocumentUrl(value) || this.isExternalUrl(value);
		},

		/**
		 * Checks if the given value is a local url
		 *
		 * @param {string} value
		 * @returns {boolean}
		 */
		isLocalUrl: function(value) {
			return value[0] === '/';
		},

		/**
		 * Checks if the given value is a inner document url (starts with #)
		 *
		 * @param {string} value
		 * @returns {boolean}
		 */
		isInnerDocumentUrl: function(value) {
			return value[0] === '#';
		},

		/**
		 * Checks if the given value is an external url (matching a URL scheme – http://en.wikipedia.org/wiki/URI_scheme)
		 *
		 * @param {string} value
		 * @returns {boolean}
		 */
		isExternalUrl: function(value) {
			return /^([a-z-]){2,}:.{2,}$/.test(value);
		}
	}).create();
});