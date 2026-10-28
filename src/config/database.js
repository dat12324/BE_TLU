import mongoose from "mongoose";
import * as models from "../models/index.js";

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await Promise.all(
      Object.entries(models).map(async ([name, model]) => {
        try {
          await model.init();
        } catch (error) {
          const code = Number.isInteger(error.code)
            ? ` (mã ${error.code})`
            : "";
          throw new Error(
            `Khởi tạo chỉ mục cơ sở dữ liệu cho ${name}${code} thất bại. Vui lòng kiểm tra dữ liệu trùng lặp và cấu hình chỉ mục hiện có.`,
          );
        }
      }),
    );
  } catch (error) {
    throw error;
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

