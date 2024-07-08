import * as typedefs from './typedefs.mjs'
import { getFiles, isObject, logMissingTag } from './helpers.mjs'
import { exifExtract } from './exiftool-instance.mjs'
import path from 'path'

/**
 * Filters the metadata object by gathering only the desired EXIF tags from an image's metadata.
 *
 * @param {string} absFilePath - The absolute path to the media file.
 * @param {string} rootDir - The absolute path to the project directory.
 * @param {Array.<string|Object>} [tagOptions=[]] - The EXIF tags to filter.
 *
 * @returns {Promise<Object|Error>} - The filtered metadata object or an error.
 *
 * @throws {Error} - If there is an error reading the metadata.
 */
async function gatherTags(absFilePath, rootDir, tagOptions = []) {
  try {
    console.log('Reading:', absFilePath)

    const metadata = await exifExtract.read(absFilePath) // metadata object from media file
    let filteredMetadata = {}

    if (tagOptions.length) {
      for (const entry of tagOptions) {
        const tag = typeof entry === 'string' ? entry : Object.keys(entry)[0] // get the current tag name to check
        const val = isObject(entry) ? entry[tag]?.val : entry[tag] // get the tag fallback value

        if (
          metadata[tag] === undefined ||
          metadata[tag] === null ||
          /^\s*$/.test(metadata[tag]) // contains only whitespace
        ) {
          if (isObject(entry) && !entry[tag].hasOwnProperty('val')) {
            // if entry is an object and does not contain a 'val' property
            filteredMetadata[tag] = entry[tag]
          } else if (isObject(entry) && entry[tag].hasOwnProperty('val')) {
            // if entry is an object and contains a 'val' property
            filteredMetadata[tag] = val

            console.log('tagname:', tag)
            console.log('tag value on file:', metadata[tag])
            console.log('tag fallback value:', metadata[tag])

            if (entry[tag].write) {
              //   await writeTagToFile(absFilePath, tag, val)
              logMissingTag(absFilePath, tag, val)
              console.warn(
                `-- exiftool writing: ${tag} : current value is ${metadata[tag]}::${val}`
              )
            }
          }
        } else {
          if (metadata[tag]) {
            filteredMetadata[tag] = metadata[tag]
          }
        }
      }
    } else {
      // We've not passed a filter so return all metadata.
      filteredMetadata = metadata
    }
    filteredMetadata.SourceFile = path.relative(rootDir, absFilePath)
    filteredMetadata.Directory = path.relative(
      rootDir,
      path.dirname(absFilePath)
    )
    return filteredMetadata
  } catch (error) {
    console.error(`Error reading metadata for ${absFilePath}:`, error)
    await exifExtract.end()
    throw new Error(`Error reading metadata for ${absFilePath}:`, error)
  }
}

/**
 * Function to traverse each file in a directory and extract tag metadata.
 * Allows for parallel processing of images by mapping over files and collecting the promises, and using Promise.allSettled
 *
 *
 * @param {String} dir
 * @param {String} rootDir - Absolute path to the project directory.
 * @param {Array.<typedefs.TagOpts>} tagOptions
 * @param {Array.<string>} allowedMediaFileExtensions
 *
 * @returns {Promise<Array>} Array of objects with EXIF metadata from each media file.
 */
async function processDirectories(
  dir,
  rootDir,
  tagOptions,
  allowedMediaFileExtensions
) {
  const files = await getFiles(dir, allowedMediaFileExtensions)

  if (files.length === 0) {
    throw new Error(`No media files found in ${dir}`)
  }
  const metadataPromises = files.map(
    async (file) => await gatherTags(file, rootDir, tagOptions)
  )
  try {
    const metadataList = await Promise.allSettled(metadataPromises)
    // Filter out any potential empty values
    return metadataList.filter(Boolean).map((result) => result.value)
  } catch (err) {
    console.error(err)
    throw err
  }
}

export { gatherTags, processDirectories }
