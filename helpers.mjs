import fs from 'fs'
import path from 'path'

/**
 * Checks if a file or directory path is valid and writable.
 *
 * @param {String} filePath - The path to check for write-ability.
 * @param {Options} opts - An options object containing the following properties:
 *   - __dirname: Absolute path to the relative project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - exifTags: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @return {Boolean} Returns true if the path is writable, false otherwise.
 *
 * @throws {Error} Throws an error if the path is not a valid path or does not have write permissions.
 */
function checkPathPermisions(filePath, opts) {
  try {
    // Get the key name as a string
    const keyName = Object.entries(opts).find(([k, v]) => v === filePath)?.[0]

    if (!filePath || typeof filePath !== 'string') {
      throw new Error(`${keyName} must be a string. Received: ${typeof path}`)
    }

    // Check if the path is valid
    fs.access(path.dirname(filePath), fs.constants.W_OK, (err) => {
      if (err) {
        console.error(`${path.dirname(filePath)} is not writable`)
        throw new Error(
          `${keyName} is not a valid path or you don't have the correct permissions? Received: ${path}`
        )
      } else {
        return true
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 *  Validate options. Throws if the options object is not formed correctly.
 *
 * @param {Options} opts - An options object containing the following properties:
 *   - __dirname: Absolute path to the relative project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - exifTags: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Void}
 *
 * @throws {Error} Throws an error if the options object is missing or not an object.
 * @throws {Error} Throws an error if the __dirname, srcDir, or outputPath property is missing or invalid.
 * @throws {Error} Throws an error if the exifTags property is present but not an array.
 * @throws {Error} Throws an error if the validExtensions property is present but not an array.
 */
function validateOptions(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error(
      'You must pass an options object minimally containing: "__dirname", "srcDir", and "outputPath" properties. Instead Received:',
      opts
    )
  }
  checkPathPermisions(opts.__dirname, opts)

  checkPathPermisions(opts.srcDir, opts)

  // outputPath may be a relative path so check last as it needs a valid opts.__dirname to compute.
  if (path.isAbsolute(opts.outputPath)) {
    console.log('outputPath is absolute:', opts.outputPath)
    checkPathPermisions(opts.outputPath, opts)
  } else {
    const resolvedpath = path.resolve(opts.__dirname, opts.outputPath)
    checkPathPermisions(resolvedpath, opts)
  }
  if (opts.exifTags && !Array.isArray(opts.exifTags)) {
    throw new Error('exifTags must be an array. Received:', opts.exifTags)
  }
  if (opts.validExtensions && !Array.isArray(opts.validExtensions)) {
    throw new Error(
      'validExtensions must be an array. Received:',
      validExtensions
    )
  }
}

export { validateOptions }
