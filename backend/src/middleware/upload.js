const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const AppError = require('../common/AppError');

// Allowed image MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Create a multer upload instance for a specific subdirectory.
 * @param {string} subDir - Subdirectory under UPLOAD_DIR (e.g., 'products', 'deliveries')
 */
function createUploader(subDir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(config.upload.dir, subDir);
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${uuidv4()}${ext}`;
      cb(null, name);
    },
  });

  const fileFilter = (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, and WebP images are allowed', 400, 'INVALID_FILE_TYPE'));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: config.upload.maxFileSizeBytes,
      files: 8, // max files per request
    },
  });
}

// Pre-configured uploaders
const productUpload = createUploader('products');
const deliveryUpload = createUploader('deliveries');

module.exports = { productUpload, deliveryUpload };
