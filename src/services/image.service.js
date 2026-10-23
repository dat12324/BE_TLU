import { randomUUID } from "node:crypto";
import streamifier from "streamifier";
import { getCloudinary } from "../config/cloudinary.js";
import {
  getImageRule,
  imageError,
  validateImage,
  MANAGED_IMAGE_ID_PATTERN,
} from "../utils/image-validation.js";

export function createImageService(clientProvider = getCloudinary) {
  async function uploadValidated(buffer, imageType) {
    const { folder } = getImageRule(imageType);
    const client = clientProvider();
    const publicId = `${folder}/${randomUUID()}`;
    const result = await new Promise((resolve, reject) => {
      let input;
      let output;
      let settled = false;
      let timer;
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input?.destroy();
        output?.destroy();
        reject(imageError("Tải ảnh lên dịch vụ lưu trữ thất bại.", 502));
      };
      timer = setTimeout(fail, 35000);
      try {
        output = client.uploader.upload_stream(
          {
            resource_type: "image",
            public_id: publicId,
            overwrite: false,
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            timeout: 30000,
          },
          (error, uploaded) => {
            if (settled) return;
            if (
              error ||
              !uploaded ||
              uploaded.public_id !== publicId ||
              typeof uploaded.secure_url !== "string" ||
              !uploaded.secure_url.startsWith("https://")
            ) {
              fail();
              return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(uploaded);
          },
        );
        output.once("error", fail);
        if (settled) {
          output.destroy();
          return;
        }
        input = streamifier.createReadStream(buffer);
        input.once("error", fail);
        input.pipe(output);
      } catch {
        fail();
      }
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  // Chỉ dùng trong dịch vụ nội bộ: kiểm tra quyền sở hữu/quyền quản trị và lấy ID
  // từ dữ liệu đáng tin cậy trong cơ sở dữ liệu trước. Kiểm tra không gian tên không thay thế kiểm tra quyền.
  async function deleteImage(publicId) {
    if (
      typeof publicId !== "string" ||
      !MANAGED_IMAGE_ID_PATTERN.test(publicId)
    ) {
      throw imageError(
        "Mã publicId của ảnh không hợp lệ hoặc không thuộc hệ thống.",
      );
    }
    const client = clientProvider();
    let result;
    try {
      result = await client.uploader.destroy(publicId, {
        resource_type: "image",
        type: "upload",
        invalidate: true,
        timeout: 30000,
      });
    } catch {
      throw imageError("Xóa ảnh trên dịch vụ lưu trữ thất bại.", 502);
    }
    if (!["ok", "not found"].includes(result?.result)) {
      throw imageError("Xóa ảnh trên dịch vụ lưu trữ thất bại.", 502);
    }
    return { deleted: result.result === "ok" };
  }

  async function uploadImage(buffer, imageType) {
    getImageRule(imageType);
    await validateImage(buffer);
    return uploadValidated(buffer, imageType);
  }

  async function uploadImages(files, imageType) {
    const { maxFiles } = getImageRule(imageType);
    if (!Array.isArray(files) || files.length === 0)
      throw imageError("Vui lòng chọn ít nhất một ảnh.");
    if (files.length > maxFiles)
      throw imageError("Số lượng ảnh vượt quá giới hạn cho loại ảnh này.");
    const buffers = files.map((file) =>
      Buffer.isBuffer(file) ? file : file?.buffer,
    );
    // Kiểm tra toàn bộ lô trước khi tạo tài nguyên trên dịch vụ bên ngoài.
    for (const buffer of buffers) await validateImage(buffer);
    const uploaded = [];
    try {
      for (const buffer of buffers)
        uploaded.push(await uploadValidated(buffer, imageType));
      return uploaded;
    } catch (error) {
      const cleanup = await Promise.allSettled(
        uploaded.map((image) => deleteImage(image.publicId)),
      );
      const remaining = uploaded.filter(
        (_image, index) => cleanup[index].status === "rejected",
      );
      if (remaining.length) {
        const failure = imageError(
          "Tải ảnh thất bại. Cần thử dọn dẹp ảnh đã tải lên một lần nữa.",
          502,
        );
        // Siêu dữ liệu nội bộ để thử lại; không tuần tự hóa toàn bộ đối tượng lỗi.
        Object.defineProperty(failure, "cleanupPublicIds", {
          value: remaining.map((image) => image.publicId),
        });
        throw failure;
      }
      throw error;
    }
  }

  return { uploadImage, uploadImages, deleteImage };
}

export const imageService = createImageService();
export const { uploadImage, uploadImages, deleteImage } = imageService;
