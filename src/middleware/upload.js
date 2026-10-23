import multer from "multer";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  getImageRule,
  imageError,
  validateImage,
} from "../utils/image-validation.js";

function createParser(maxFiles, multiple) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: maxFiles,
      fields: 10,
      parts: maxFiles + 10,
      fieldSize: 16 * 1024,
    },
    fileFilter(_req, file, callback) {
      if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
        return callback(
          imageError("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.", 415),
        );
      }
      callback(null, true);
    },
  });
  const parser = multiple
    ? upload.array("images", maxFiles)
    : upload.single("image");
  return (req, res, next) =>
    parser(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        return next(
          imageError(
            "Ảnh tải lên vượt quá giới hạn dung lượng, số lượng hoặc giới hạn biểu mẫu.",
            error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          ),
        );
      }
      if (error)
        return next(
          imageError(
            "Dữ liệu tải ảnh không hợp lệ.",
            error.status === 415 ? 415 : 400,
          ),
        );
      const files = multiple ? req.files : req.file ? [req.file] : [];
      if (!files?.length) return next(imageError("Vui lòng chọn tệp ảnh."));
      (async () => {
        for (const file of files) {
          const detected = await validateImage(file.buffer);
          if (detected.mime !== file.mimetype) {
            throw imageError(
              "Định dạng ảnh khai báo không khớp với nội dung tệp.",
              415,
            );
          }
        }
      })().then(() => next(), next);
    });
}

// Chọn hằng số trong mã định tuyến phía máy chủ, không lấy từ req.body. Gắn sau bước xác thực.
export function createImageUpload(imageType, { multiple } = {}) {
  const { maxFiles } = getImageRule(imageType);
  const useMultiple = multiple ?? maxFiles > 1;
  return createParser(useMultiple ? maxFiles : 1, useMultiple);
}

export const uploadSingleImage = createParser(1, false);
export const uploadMultipleImages = createParser(5, true);
