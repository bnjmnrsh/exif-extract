# EXIF EXTRACT

__THIS PROJECT IS IN BETA:__ *Expect changes in API, incomplete documentaion and bugs. PR's and reports welcome.*  

`exif-extract` is a thin wrapper for [`exiftool-vendored`](https://photostructure.github.io/exiftool-vendored.js/index.html), which in turn, is a JavaScript implementation of the excellent CLI application [`exiftool`](https://exiftool.org).

`exif-extract` is designed to iterate over the content of a directory tree searching for targeted media types and returns a filtered set of EXIF metadata either as a JavaScript object or written to the filesystem as JSON. `exif-extract` provides a simple API and basic configuration options, including the ability to return default values for empty/missing EXIF tags, and optionally write these values back to the media file if desired.

`exif-extract` was created to generate JSON endpoints for [Astro Data Collections](https://docs.astro.build/en/guides/content-collections/) from a directory of media files annotated using Adobe Bridge. While the documentation and examples here are primarily concerned with key-field mappings between Adobe Bridge's 'IPTC CORE' metadata fields and `exiftool` tags, `exif-extract` is agnostic of both Astro and Adobe Bridge and is compatible with any EXIF key supported by `exiftool-vendored`.

## INDEX

- [EXIF EXTRACT](#exif-extract)
  - [INDEX](#index)
  - [INSTALLATION](#installation)
  - [METHODS](#methods)
  - [OPTIONS](#options)
    - [FALLBACK VALUES](#fallback-values)
    - [WRITING VALUES BACK TO FILE](#writing-values-back-to-file)
  - [USAGE](#usage)
    - [Sample Implementation](#sample-implementation)
    - [Parallelism](#parallelism)
  - [TAGS/KEYS](#tagskeys)
    - [EXIF keys populated by Adobe Bridge](#exif-keys-populated-by-adobe-bridge)
    - [Asymmetrical Tags \& Writing to Files](#asymmetrical-tags--writing-to-files)
      - [Mixed Tag Support](#mixed-tag-support)
      - [Object Groups \& 'Flattened' Tags](#object-groups--flattened-tags)
      - [Handling Asymmetrical Tags \& Pass-Through values](#handling-asymmetrical-tags--pass-through-values)
        - [Custom Keys](#custom-keys)
      - [Write Errors](#write-errors)
  - [RESOURCES](#resources)
    - [EXIF Tag Notes](#exif-tag-notes)
      - [Common Tags](#common-tags)
      - [Tag by media type](#tag-by-media-type)
      - [Useful threads](#useful-threads)
  - [ISC LICENSE](#isc-license)

## INSTALLATION

```bash
    npm i -D bnjmnrsh/exif-extract#v0.0.1
```

We recommend pegging your install to a tag, as this will ensure any changes will not affect your output.

## METHODS

`exif-extract` exposes two methods: `extractMetadata` and `extractMetadataToJsonFile`.

```javascript
import { extractMetadata, extractMetadataToJsonFile } from 'exif-extract'
```

Both methods accept the same base settings object, with `extractMetadataToJsonFile` additionally requiring `opt.outputPath` and `opt.outputFilename` properties.

## OPTIONS

`exif-extract` accepts an object of options.

| Option key                                            | Notes                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opt.__dirname<String>`                               | The full path to the root of your project. It is used to extrapolate relative paths between the source media files and the output JSON file (if any). |
| `opt.srcDir<String>`                                  | A relative path from `__dirname` to the source media files' directory. (i.e. `../src/media-archive`)                                                  |
| `opt.validExtensions<Array.<String>>`                 | An array of file extensions to include. (Defaults to ['.jpg', '.jpeg']). Maybe [any supported file type](https://exiftool.org/#supported).            |
| `opt.exifTags<Array.<String\|Object>>`                | An array of EXIF tags to extract from the media files. If an empty array is provided (default), all available metadata will be extracted.             |
| `opt.outputPath<String>` ( `extractMetadata()` only ) | Relative Path. A path to the output directory relative to your calling script. (i.e. `../src/content/media-archive`)                                  |
| `opt.fileName<String>` ( `extractMetadata()` only )   | The name of the output JSON file. (e.g. `media-archive.json`)                                                                                         |

### FALLBACK VALUES

`exif-extract` strips empty EXIF tags from the output; however, if desired, you may pass an object with a fallback value for specific tags which will be passed through to the output.

```javascript
const exifTags = [
  { Credit: 'Eddie Adams' }
  // { Credit: { val: 'Eddie Adams' } } // equivalent syntax
]
```

### WRITING VALUES BACK TO FILE

Writing back values to media files is particularly useful for tags whose value can be safely assumed and _must also_ exist on the media file (e.g., copyright information). These default values will not overwrite any existing value found in the tag unless it is an empty string.

```javascript
const exifTags = [
  {
    CopyrightNotice: {
      val: '© Some rights reserved.',
      write: true // Write back to the media file
    }
  },
  {
    Subject: { val: null, write: true } // passing null will unset a tag on the media file.
  }
]
```

**NOTE:** Key values are typically but not always strings. Additionally not all tags are writeable. See [`exiftool` tag documentation](https://exiftool.org/TagNames/index.html) for complete details.

## USAGE

### Sample Implementation

This could be called as part of a build step, or a standalone script.

```javascript
import { extractMetadataToJsonFile } from 'exif-extract'
// Node modules for file paths
import path from 'path'.
import { fileURLToPath } from 'url'

// Get the location of this script
// ES modules cannot access node vars like __dirname, so we must re-implement it.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The source images' relative (or absolute) location
const srcDir = path.join(__dirname, '../src/content/your-media-archive')

// The relative location of the output JSON file
const outputPath = '../src/content/your-media-archive/'

// Output file name with extension
const fileName = 'media-archive.json'

// The file types to include. Defaults to ['.jpg', '.jpeg']
const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp3', '.mp4']

// An array of EXIF fields to extract from media files; the exact tags available depend on the file type; see notes below.
// Defaults to an empty array, which will extract all available tags on each file.
// This can be good for inspecting what tags are avalible, but is a lot of extraneous data.
const exifTags = [
  'FileName',
  'SourceFile',
  'Directory',
  'FileType',
  'FileSize',
  'ImageWidth',
  'ImageHeight',
  'ImageSize',
  'Title',
  'Description',
  { AltTextAccessibility : 'An image of an engineer reading documentation.' }, // Object syntax, not saved to file
  {
    CopyrightNotice: {val: '© All rights reserved.', write: true} // Object syntax, saved back to file metadata
  },
  'CreatorContactInfo'
]

extractMetadataToJsonFile({
  __dirname,
  srcDir,
  outputPath,
  exifTags,
  validExtensions
})
  .then((result) => {
    console.log('extractToJson did not encounter errors.')
  })
  .catch((error) => {
    console.error('Error:', error)
  })
```

### Parallelism

`exif-extract` uses `exiftool-vendored` as a singleton to extract one file per call. To improve performance, `exif-extract` uses a promises-based approach to asynchronously process multiple files at once, which is is throttled by the default settings of the `exiftool-vendored` singleton. `exif-extract` does not currently offer a direct way to manipulate the `exiftool-vendored` singleton default settings.

See [exiftool-vendored Performance](https://github.com/photostructure/exiftool-vendored.js?tab=readme-ov-file#performance) for details.

## TAGS/KEYS

### EXIF keys populated by Adobe Bridge

This table documents the EXIF keys populated by Adobe Bridge's 'IPTC CORE' metadata fields as extracted using `exiftool-vendored`.
EXIF tag names are [PascalCased](https://photostructure.github.io/exiftool-vendored.js/index.html#md:tags), while compound or prefixed tags must be set in quotes e.g. `'XMP-xmpRights:Marked'`.

| ADOBE BRIDGE FIELD                   | EXIFTOOL KEYS (JPEG)                                                     | ASYMMETRICAL TAGS / RESULTS              |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| Creator                              | `Creator<Array>`                                                         | `Artist<String>`, `By-line<String>`      |
| Creator: Job Title                   | `AuthorsPosition<String>`, `By-lineTitle<String>`                        | n/a                                      |
| Creator: Address                     | `CreatorAddress<String>`,                                                | `CreatorContactInfo.CiAdrExtadr<String>` |
| Creator: City                        | `CreatorCity<String>`                                                    | `CreatorContactInfo.CiAdrCity<String>`   |
| Creator: State/Province              | `CreatorRegion<String>`                                                  | `CreatorContactInfo.CiAdrRegion<String>` |
| Creator: Postal Code                 | `CreatorPostalCode<String>`                                              | `CreatorContactInfo.CiAdrPcode<String>`  |
| Creator: Country                     | `CreatorCountry<String>`                                                 | `CreatorContactInfo.CiAdrCtry<String>`   |
| Creator: Phone(s)                    | `CreatorWorkTelephone<String>`                                           | `CreatorContactInfo.CiTelWork<String>`   |
| Creator: Email(s)                    | `CreatorWorkEmail<String>`                                               | `CreatorContactInfo.CiEmailWork<String>` |
| Creator: Website(s)                  | `CreatorWorkURL<String>`,                                                | `CreatorContactInfo.CiUrlWork<String>`   |
| Headline                             | `Headline<String>`                                                       | n/a                                      |
| Description                          | `Description<String>`, `Caption-Abstract<String>`                        | n/a                                      |
| Alt Text (accessibility)             | `AltTextAccessibility<String>`                                           | n/a                                      |
| Extended Description (accessibility) | `ExtDescrAccessibility<String>`                                          | n/a                                      |
| Keywords †                           | `Subject<Array>`                                                         | `Keywords<String>`                       |
| IPTC Subject Code                    | `SubjectCode<String>`                                                    | n/a                                      |
| Description Writer                   | `CaptionWriter<String>`                                                  | n/a                                      |
| Date Created                         | `DateCreated<String><Object>`                                            | n/a                                      |
| Intellectual Genre                   | `IntellectualGenre<String>`                                              | n/a                                      |
| IPTC Scene Code                      | `Scene<String>`                                                          | n/a                                      |
| City                                 | `City<String>`                                                           | n/a                                      |
| State/Province                       | `State<String>`, `Province-State<String>`                                | n/a                                      |
| Country                              | `Country<String>`, `Country-PrimaryLocationName<String>`                 | n/a                                      |
| ISO COUNTRY CODE                     | `CountryCode<String>`, `Country-PrimaryLocationCode<String>`             | n/a                                      |
| Title                                | `ObjectName<String>`                                                     | n/a                                      |
| Job Identifier                       | `TransmissionReference<String>`, `OriginalTransmissionReference<String>` | n/a                                      |
| Instructions                         | `Instructions<String>`, `SpecialInstructions<String>`                    | n/a                                      |
| Credit Line                          | `Credit<String>`                                                         | n/a                                      |
| Source                               | `Source<String>`                                                         | n/a                                      |
| Copyright Notice                     | `CopyrightNotice<String>`, `Rights<String>`, `Copyright<String>`         | n/a                                      |
| Copyright Status ††                  | `XMP-xmpRights:Marked<String('true'\|'false')\|Number(1\|0) \| null>`    | `CopyrightFlag<Boolean\|null>`           |
| Rights Usage Terms                   | `UsageTerms<String>`, `'xmp:usageterms'<String>`                         | n/a                                      |

† The `Keywords` key is unavailable on MP3 and assumably MPG-1 MPG-2; use `Subject` instead (or both) for greater portability.

†† Adobe Bridge reliably updates its 'Copyright Status' field via the `XMP-xmpRights:Marked` tag, but a raw read from a file will reveal the value is assigned to `CopyrightFlag` instead. However, direct writes to `CopyrightFlag` will not be read by Bridge, and I am unsure if this is an implementation bug in Bridge. Updating subject adjacent tags like `CopyrightStatus` and `XMP: copyright status` do not affect the 'Copyright Status' field.
`XMP-xmpRights:Marked` accepts numerical 1 or 0 and String values of 'true' or 'false', but `exiftool-vendored` will throw if passed a boolean value of `true` or `false`.

### Asymmetrical Tags & Writing to Files

Sometimes, when writing values back to a file, the tags you provide to the `exifTags` array and where these values are written to on a media file can be asymmetrical. One reason is that not all tags are represented on all media types. In other cases, some keys may be a part of a group of related fields represented as objects.

#### Mixed Tag Support

Some tags are unevenly represented across media types. In fact, of the thousands of tags in the `exiftool-vendored` corpus, only a handful are commonly used. To increase compatibility and portability across tools and media, apps like Adobe Bridge and `exiftool` may write tag data to a range of additional or substitute tags commonly used for similar purposes. This can create a condition where the tag you pass in might not be returned by `exif-extract`, even though it may have been written to the file via an analogous tag.

MP3 files, for example, do not have a `Keywords` tag but do have a `Subject` tag. So, for portability, Adobe Bridge will write data in its Keywords field to both `Subject` and `Keywords` EXIF tags on JPEG files, though on MP3s, only the `Subject` appears. So if your script only passes in `Keywords` into the `exifTags` filter, the value will be missing for MP3s. To get around this, if you have a mix of media types, you should favour `Subject` over `Keywords` (or use both).

#### Object Groups & 'Flattened' Tags

Another category of asymmetry comes from tag groups. An easy example is the "Creator: XYZ" fields in Adobe Bridge, which are represented as the `CreatorContactInfo` object by `exiftool-vendored`. To make it easier to write to group properties, `exiftool-vendored` exposes several 'flattened' tags for convenience.

For convenience, `exif-extract` will include these 'flattened' keys in its output. However, if you would _also_ like to receive the parent object and its other properties, you must also pass in the parent object key, e.g., `CreatorContactInfo`.

Config:

```javascript
const exifTags = [
    { CreatorWorkURL: {val: 'https://example.com', write: true} },  // will be passed through to output as CreatorWorkURL, but saved to file as 'CreatorContactInfo.CiUrlWork'
    CreatorContactInfo, // pass in the parent object to have it and its properties added to the output.
    ...
]
```

Result:

```javascript
{
 CreatorWorkURL: 'https://example.com',
 CreatorContactInfo: {
    CiUrlWork: 'https://example.com',
    ...
 }
}
```

#### Handling Asymmetrical Tags & Pass-Through values

To provide a better DX, `exif-extract` will 'pass through' to output keys presented in object notion with a fallback value, regardless of whether that key could usually be found in a file's metadata. In other words, even though a tag may not be natively symmetrical, we will make it appear as if it were in the returned output. For example, if you pass `Keywords` into the `exifTags` array, the output will contain the `Keywords` tag, even if a media type doesn't natively support it. This is also true for keys with the `write: true` flag, provided the key is known to `exiftool`. See also [Write Errors](#write-errors).

##### Custom Keys

This pass-through behaviour allows you to create arbitrary 'custom keys' unavailable in the file.† Providing a unique prefix for any custom key is advisable to avoid collisions with pre-existing keys. So long as `exif-extract` does not encounter a key of the same name with a set value, your custom value will be passed through to the output.

```javascript
const exifTags = [
    { 'MY:CustomTag': 'Custom Value' },
    ...
]
```

It is important to remember that this behaviour is unique to `exif-extract`. Keys that have been 'passed through' to the output are not saved to a file and are only a result of the configuration passed to `exif-extract`.

† While `exiftool` does provide a means for creating arbitrary XML tags and saving them, this functionality is beyond the scope of `exif-extract`.

#### Write Errors

To prevent you from attempting to write to arbitrary (custom) or misspelt tag names, `exiftool-vendored` will throw an error if a tag does not exist in the corpus of compatible tags or if you attempt to pass values it deems to be incompatible for that tag.

## RESOURCES

<https://photostructure.github.io/exiftool-vendored.js/>
<https://github.com/photostructure/exiftool-vendored.js>
<https://exiftool.org/>

### EXIF Tag Notes

<https://exiftool.org/#links>
<https://exiftool.org/TagNames/>

#### Common Tags

<https://exiftool.org/TagNames/EXIF.html>
<https://exiftool.org/TagNames/XMP.html>
<https://exiftool.org/TagNames/IPTC.html>

#### Tag by media type

<https://exiftool.org/TagNames/JPEG.html>
<https://exiftool.org/TagNames/PNG.html>
<https://exiftool.org/TagNames/GIF.html>
<https://exiftool.org/TagNames/MPEG.html> | MP3 (MPEG-1 layer 3 audio), MPEG-2, etc.
<https://exiftool.org/TagNames/QuickTime.html> | MPEG-4, Apple QuickTime, etc.

#### Useful threads

<https://exiftool.org/forum/index.php?topic=6959.0>
<https://exiftool.org/forum/index.php?topic=11094.0>

## ISC LICENSE

Copyright 2024 Benjamin Rush | bnjmnrsh

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
