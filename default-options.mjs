import * as typedefs from './typedefs.mjs'

/**
 * Default options.
 *
 * @type {typedefs.Options}
 */
export const defaults = {
  __dirname: '',
  srcDir: '',
  outputPath: '',
  fileName: 'metadata.json',
  exifTags: [],
  validExtensions: ['.jpg', '.jpeg']
}
