const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/images');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const bulkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/bulk');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-bulk`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const bulkFilter = (req, file, cb) => {
  const allowed = /csv|xml/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV or XML files are allowed'), false);
  }
};

const uploadImage = multer({ storage: imageStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadBulk = multer({ storage: bulkStorage, fileFilter: bulkFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = { uploadImage, uploadBulk };
