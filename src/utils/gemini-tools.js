import * as productService from '../services/product.service.js';
import { HttpError } from './http-error.js';

export const productFunctionDeclarations = [
  {
    name: 'searchProducts',
    description: 'Tìm sản phẩm TLUPhone theo nhu cầu và ngân sách, mặc định còn hàng. Kết quả dùng để hiện thẻ sản phẩm; khách nhấn thẻ để chọn cấu hình và mua hàng tại trang chi tiết. Không tự bịa sản phẩm khi không có kết quả.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Tên sản phẩm, ví dụ iPhone 15.' },
        brand: { type: 'string', description: 'Slug thương hiệu, ví dụ apple, samsung, xiaomi.' },
        category: { type: 'string', description: 'Slug danh mục, ví dụ dien-thoai-thong-minh.' },
        tags: { type: 'string', description: 'Các tag cần có, phân cách bằng dấu phẩy: gaming (chơi game), photography (chụp ảnh), battery (pin tốt). Nhiều tag yêu cầu đáp ứng tất cả.' },
        minPrice: { type: 'integer', minimum: 0, description: 'Giá tối thiểu, VND, bao gồm mốc này.' },
        maxPrice: { type: 'integer', minimum: 1, description: 'Giá phải nhỏ hơn mốc này, VND. Nếu khách nói tối đa X, truyền X + 1.' },
        ram: { type: 'integer', minimum: 1, description: 'RAM tính bằng GB.' },
        storage: { type: 'integer', minimum: 1, description: 'ROM tính bằng GB; 1TB = 1024, 2TB = 2048.' },
        color: { type: 'string', description: 'Tên màu tiếng Việt.' },
        inStock: { type: 'boolean', description: 'Mặc định true. false để xem SKU hết hàng khi khách yêu cầu.' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc', 'newest', 'rating_desc', 'battery_desc'], description: 'Pin trâu/pin tốt nhất: dùng battery_desc để xếp dung lượng pin (mAh) giảm dần, limit=5; không thêm tags=battery vì sẽ bỏ sót máy pin lớn chưa có tag.' },
        limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Số sản phẩm trả về, mặc định 5.' },
      },
      additionalProperties: false,
    },
  },
];

export const searchProducts = async (args = {}) => {
  const { search, brand, category, tags, minPrice, maxPrice, ram, storage, color,
    inStock = true, sort = 'price_asc', limit = 5 } = args;
  for (const value of [search, brand, category, tags, color]) {
    if (value !== undefined && (typeof value !== 'string' || value.length > 200)) {
      throw new HttpError(400, 'Tiêu chí tìm sản phẩm phải là chuỗi tối đa 200 ký tự.');
    }
  }
  for (const [field, value] of Object.entries({ minPrice, maxPrice, ram, storage, limit })) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < (field === 'minPrice' ? 0 : 1))) {
      throw new HttpError(400, 'Giá, RAM, ROM và số kết quả phải là số nguyên hợp lệ.');
    }
  }
  if (limit > 10 || typeof inStock !== 'boolean' ||
      !['price_asc', 'price_desc', 'newest', 'rating_desc', 'battery_desc'].includes(sort) ||
      (minPrice !== undefined && maxPrice !== undefined && minPrice >= maxPrice)) {
    throw new HttpError(400, 'Bộ lọc sản phẩm không hợp lệ.');
  }
  const result = await productService.listProducts(1, limit, search, brand, category, 'active', false,
    { tags, minPrice, maxPrice, ram, storage, color, inStock, sort });
  return {
    response: {
      data: result.data.map(product => ({
        name: product.name, slug: product.slug, brand: product.brandInfo?.name ?? null,
        technicalSpecs: product.technicalSpecs ?? {}, tags: product.tags ?? [],
        price: product.price, compareAtPrice: product.compareAtPrice,
        availableStock: product.skus[0]?.availableStock ?? null,
      })),
      pagination: result.pagination,
    },
    // Dành cho thẻ FE, không gửi ảnh vào Gemini.
    products: result.data.map(product => ({
      name: product.name, slug: product.slug, brand: product.brandInfo?.name ?? null,
      image: product.images?.find(image => image.isPrimary && image.url)?.url
        ?? product.images?.find(image => image.url)?.url ?? null,
      price: product.price ?? null, compareAtPrice: product.compareAtPrice ?? null,
    })),
  };
};

// Chỉ cho Gemini tìm sản phẩm; không nhận truy vấn MongoDB hoặc quyền Admin.
export const executeProductFunctionCall = async ({ name, args = {} } = {}) => {
  const declaration = productFunctionDeclarations.find(item => item.name === name);
  if (!declaration) throw new HttpError(400, 'Hàm tư vấn không được hỗ trợ.');
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(key => !Object.hasOwn(declaration.parametersJsonSchema.properties, key))) {
    throw new HttpError(400, 'Tham số hàm tư vấn không hợp lệ.');
  }
  return searchProducts(args);
};
