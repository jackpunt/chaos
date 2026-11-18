// coerce /dist files into a clickable app:
//
//
// npm install --save-dev inline-source-cli
// npm install --save-dev gulp gulp-replace gulp-inline-source
//
// inline the asset files, by injecting into HTMLDivElement: canvas-asset-registry
// scan the asset/images directory and slurp in each .png file:
//
// ng build --configuration production --base-href ./ && gulp bundle-html

// npx gulp asset-tags && \
// npx ng build --configuration production --base-href ./ && \
// npx gulp bundle-html
// npx inline-source --root ./dist/chaos/ ./dist/chaos/index.html ./dist-standalone/chaos.html

const gulp = require('gulp');
const replace = require('gulp-replace');
const fs = require('fs');

// insert <img/> elements for each asset into app.component.html
gulp.task('asset-tags', () => {
  const imgTags = [];

  // 1. Match all images in assets and its subfolders using a glob pattern; ignore dev-time "NP*.png"
  return gulp.src(['./src/assets/**/*.{png,jpg,jpeg,ico}', '!./src/assets/**/NP*.png'])
    .on('data', (file) => {
      // Extract the path relative to the 'src/' directory (e.g., "assets/images/fileName.png")
      const relativePath = file.relative;

      // Generate a clean ID by swapping path slashes with dashes and dropping the extension
      // (e.g., "assets/images/hero.png" becomes "asset-assets-images-hero")
      const imageId = 'assets_' + relativePath.replace(/[\/\.]/g, '_');
      console.log(`imageId=${imageId}`);
      imgTags.push(`<img id="${imageId}" src="assets/${relativePath}" style="display:none;" loading="lazy" inline />`);
    })
    .on('end', () => {
      const updatedRegistryBlock = `<div id="assets-image-registry" style="display:none;">\n  ${imgTags.join('\n  ')}\n</div>`;
      const searchRegex = /<div id="assets-image-registry"[\s\S]*?<\/div>/;

      // 2. Inject the gathered tags back into your target template
      return gulp.src('./src/index.html')
        .pipe(replace(searchRegex, updatedRegistryBlock))
        .pipe(gulp.dest('./src/'));
    })
  });

// Task 1: Convert favicon.ico to base64 data URI and inject it into src/index.html
gulp.task('embed-favicon', (done) => {
  const faviconPath = './src/assets/favicon.ico';

  fs.readFile(faviconPath, (err, data) => {
    if (err) return done(err);

    // Convert the binary buffer directly to a base64 string
    const base64Data = data.toString('base64');
    const dataUri = `data:image/x-icon;base64,${base64Data}`;

    // Match any existing <link rel="icon" ... href="..."> element
    const faviconRegex = /<link rel="icon"[^>]*href="[^"]*"[^>]*>/;
    const newFaviconTag = `<link rel="icon" type="image/x-icon" href="${dataUri}">`;

    gulp.src('./src/index.html')
      .pipe(replace(faviconRegex, newFaviconTag))
      .pipe(gulp.dest('./src/'))
      .on('end', done);
  });
});

// compile with ng build:
// ng build --configuration production --base-href ./ && gulp insert-inline-attrs

// Task 2: Inject inline attributes into the compiled Angular script and style tags
gulp.task('insert-inline-attrs', () => {
    return gulp.src('./dist/chaos/index.html')
        .pipe(replace('type="module"', 'type="module" inline'))
        .pipe(replace('rel="stylesheet"', 'rel="stylesheet" inline'))
        .pipe(gulp.dest('./dist/chaos/'));
});

gulp.task('set-build-date', (done) => {
  const indexPath = './dist/chaos/index.html'; // Path to your compiled build output
  const buildDate = new Date().toLocaleString();   // Generate the current local timestamp string
  let indexContent = fs.readFileSync(indexPath, 'utf8'); // Read the compiled index.html
  // Replace the build-date contents:
  indexContent = indexContent.replace(/(?<=name="build-date" content=")[^"]*/, buildDate);
  fs.writeFileSync(indexPath, indexContent, 'utf8'); // Save the modified file back to disk
  done();
});

// Task 3: inline to single file:
// npx inline-source-cli --root ./dist/chaos/ ./dist/chaos/index.html ./dist-standalone/chaos.html

// Task 3: Inject inline flags into built scripts/styles and compile the standalone file
gulp.task('bundle-html', () => {
  return gulp.src('./dist/chaos/index.html')
    // Force gulp-inline-source to process the compiled Angular bundles
    .pipe(replace('type="module"', 'type="module" inline'))
    .pipe(replace('rel="stylesheet"', 'rel="stylesheet" inline'))
    // Execute the processing engine over the build outputs folder
    .pipe(inlinesource({      // this version does not work with modern ng/HTML, use -cli
        compress: false,
        rootpath: './dist/chaos/'
    }))
    // Output the final independent file structure
    .pipe(gulp.dest('./dist-standalone'));
});
