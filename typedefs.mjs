/**
 * An EXIF tag preference object, which may be:
 *      - A string, the EXIF key name. This will simply include the tag value in the output, if it has been populated on the media file.
 *      - An object with the key and value. In this case, if the tag is not populated on the media file, the fallback value will be used if the key is not populated on the media file.
 *      - The value may also optionally be a key, with a val and write boolean. The write boolean is optional and defaults to false.
 *
 * @typedef {Object} TagOps
 * @property {String | { [key: String]: { val: String, write?: Boolean } | null } } key - A string of EXIF key name, or an object with the key and value. The value may also optionally be a key, with a val and write boolean. The write boolean is optional and defaults to true.
 */

/**
 * Options object
 *
 * @typedef {Object} Options - The default options.
 * @property {String} srcDir - Relative path of directory to traverse.
 * @property {String} outputPath - The relative path of the directory to write output.
 * @property {String} fileName - The name of the output file with extension.
 * @property {Array.<TagOps>} tagOptions - An array of EXIF tags to extract.
 * @property {Array.<string>} validExtensions - An array of valid media extensions.
 */
