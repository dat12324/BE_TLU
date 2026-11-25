import * as productService from '../services/product.service.js';
import { HttpError } from './http-error.js';
import { normalizeCapacity } from './capacity.js';
import Product from '../models/Product.js';
const prompt= `
Tìm điện thoại tại TLUPhone theo nhu cầu và ngân sách.
Nếu khách chỉ hỏi "chụp ảnh đẹp", "chơi game tốt" mà
chưa có ngân sách hoặc tiêu chí đủ rõ, hãy hỏi lại
trước khi gọi công cụ này.
Không gọi tìm kiếm với bộ lọc rỗng cho các yêu cầu
cần tư vấn theo nhu cầu.
`

export const productTools = [
  {
    name: 'compareProducts',
    description: 'So sánh trực tiếp 2–3 điện thoại bằng dữ liệu thực tế. Truyền tên máy từ khách hoặc các sản phẩm đã giới thiệu, không tự đoán slug. Nếu tên chưa rõ, kết quả yêu cầu hỏi lại khách.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        products: { type: 'array', minItems: 2, maxItems: 3, items: {
          type: 'object', properties: {
            name: { type: 'string', description: 'Tên điện thoại cần so sánh.' },
            ram: { type: 'integer', minimum: 1 },
            storage: { type: 'integer', minimum: 1, description: 'GB; 1TB = 1024.' },
            color: { type: 'string' },
          }, required: ['name'], additionalProperties: false,
        } },
      }, required: ['products'], additionalProperties: false,
    },
  },
  {
    name: 'searchProducts',
    description: prompt,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Tên sản phẩm, ví dụ iPhone 15.' },
        brand: { type: 'string', description: 'Slug thương hiệu, ví dụ apple, samsung, xiaomi.' },
        category: { type: 'string', description: 'Slug danh mục, ví dụ dien-thoai-thong-minh.' },
        isNew: { type: 'boolean', description: 'Dùng true khi khách hỏi mẫu/dòng điện thoại mới hoặc mới ra mắt. Đây là flags.isNew do cửa hàng đánh dấu, không phải ngày hãng ra mắt. Dùng resultMode=list, sort=newest.' },
        tags: { type: 'string', description: 'Các tag cần có, phân cách bằng dấu phẩy: gaming (chơi game), photography (chụp ảnh), battery (pin tốt). Nhiều tag yêu cầu đáp ứng tất cả.' },
        minPrice: { type: 'integer', minimum: 0, description: 'Giá tối thiểu, VND, bao gồm mốc này.' },
        maxPrice: { type: 'integer', minimum: 1, description: 'Giá phải nhỏ hơn mốc này, VND. Nếu khách nói tối đa X, truyền X + 1.' },
        ram: { type: 'integer', minimum: 1, description: 'RAM tính bằng GB.' },
        storage: { type: 'integer', minimum: 1, description: 'ROM tính bằng GB; 1TB = 1024, 2TB = 2048.' },
        color: { type: 'string', description: 'Tên màu tiếng Việt.' },
        inStock: { type: 'boolean', description: 'Mặc định true. false để xem SKU hết hàng khi khách yêu cầu.' },
        checkAvailability: { type: 'boolean', description: 'Dùng true khi khách hỏi một máy/phiên bản còn hàng không. Trả cả phiên bản hết hàng hoặc chưa xác định tồn kho, giữ đúng RAM/ROM/màu khách yêu cầu.' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc', 'newest', 'rating_desc', 'battery_desc'], description: 'Pin trâu/pin tốt nhất: dùng battery_desc để xếp dung lượng pin (mAh) giảm dần, limit=5; không thêm tags=battery vì sẽ bỏ sót máy pin lớn chưa có tag.' },
        resultMode: { type: 'string', enum: ['list', 'recommend'], description: 'Mặc định list: hiển thị các máy khớp bộ lọc. Chỉ dùng recommend khi khách yêu cầu tốt nhất, nên chọn máy nào, hoặc một số lượng cụ thể. Chơi game tốt/chụp ảnh đẹp trong tầm giá vẫn là list.' },
        page: { type: 'integer', minimum: 1, description: 'Trang kết quả, mặc định 1. Khi khách yêu cầu xem tiếp, giữ nguyên bộ lọc và tăng trang.' },
        limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Mặc định 10. Khi liệt kê trong tầm giá, dùng 10; nếu còn kết quả thì xem trang tiếp theo.' },
      },
      additionalProperties: false,
    },
  },
];

export const searchProducts = async (args = {}) => {
  const { search, brand, category, tags, minPrice, maxPrice, ram, storage, color, isNew,
    inStock = true, checkAvailability = false, sort = isNew ? 'newest' : 'price_asc', limit = 10,
    page = 1, resultMode = 'list' } = args;
  const result = await productService.listProducts(page, limit, search, brand, category, 'active', false,
    { tags, minPrice, maxPrice, ram, storage, color, isNew, inStock: checkAvailability ? undefined : inStock,
      sort: resultMode === 'recommend' ? 'price_desc' : sort });
  // Tư vấn chung: ưu tiên nhóm sát giá cao nhất; trong nhóm mới xét cấu hình.
  // Tra cứu máy cụ thể vẫn giữ các phiên bản để đối chiếu.
  if (resultMode === 'recommend' && !search && result.data.length) {
    const highestPrice = result.data[0].price;
    result.data = result.data.filter(product => product.price >= highestPrice * 0.9);
  }
  // Chỉ lấy thêm thông số chi tiết của trang ứng viên khi cần chọn/đối chiếu máy.
  const details = resultMode === 'recommend' && result.data.length
    ? await Product.find({ slug: { $in: result.data.map(product => product.slug) }, status: 'active' })
      .select('slug specifications').lean()
    : [];
  return {
    resultMode,
    nextPage: resultMode === 'list' && result.pagination.page < result.pagination.totalPages
      ? { ...args, page: result.pagination.page + 1, limit: result.pagination.limit, resultMode: 'list' }
      : null,
    response: {
      resultMode,
      ...(isNew === true ? {
        newProductsNote: 'Sản phẩm được cửa hàng đánh dấu flags.isNew=true. sort=newest sắp theo ngày thêm vào hệ thống (createdAt), không phải ngày hãng ra mắt. Không khẳng định mới nhất thị trường.',
      } : {}),
      ...(checkAvailability ? {
        availabilityCheck: true,
        criteria: { search, ram, storage, color },
        result: result.data.some(product => product.skus.length) ? 'matched' : 'no_matching_active_variant',
      } : {}),
      data: result.data.map(product => ({
        name: product.name, slug: product.slug, brand: product.brandInfo?.name ?? null,
        technicalSpecs: product.technicalSpecs ?? {}, tags: product.tags ?? [],
        ...(resultMode === 'recommend' ? {
          specifications: details.find(detail => detail.slug === product.slug)?.specifications ?? [],
        } : {}),
        version: {
          ram: product.skus[0]?.ram ?? null,
          storage: product.skus[0]?.storage ?? null,
          color: product.skus[0]?.color?.name ?? null,
        },
        price: product.price, compareAtPrice: product.compareAtPrice,
        availableStock: product.skus[0]?.availableStock ?? null,
        ...(checkAvailability ? {
          matchingVariantCount: product.skus.length,
          variants: product.skus.slice(0, 10).map(sku => ({
            sku: sku.sku, ram: sku.ram ?? null, storage: sku.storage ?? null,
            color: sku.color?.name ?? null, price: sku.price,
            availableStock: sku.availableStock ?? null,
            availability: sku.availableStock == null ? 'unknown' : sku.availableStock > 0 ? 'in_stock' : 'out_of_stock',
          })),
        } : {}),
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

const normalizeLabel = value => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
const capacityLabel = value => {
  const capacity = normalizeCapacity(value);
  return capacity == null ? null : capacity >= 1024 && capacity % 1024 === 0 ? `${capacity / 1024}TB` : `${capacity}GB`;
};

export const compareProducts = async ({ products } = {}) => {
  const resolved = [];
  for (const { name, ram, storage, color } of products) {
    const found = await searchProducts({ search: name.trim(), ram, storage, color, checkAvailability: true });
    const exact = found.response.data.filter(item => normalizeLabel(item.name) === normalizeLabel(name));
    const candidates = exact.length ? exact : found.response.data;
    if (candidates.length !== 1 || (!exact.length && found.response.pagination.total > 1) || !candidates[0].variants.length) {
      return { products: [], comparison: null, response: {
        needsClarification: true, requestedName: name,
        message: 'Chưa xác định được đúng máy/phiên bản. Hỏi lại khách theo các tên tìm được, không tự chọn máy thay thế.',
        candidates: found.response.data.map(item => ({ name: item.name, slug: item.slug })),
      } };
    }
    const item = candidates[0];
    let detail;
    try {
      detail = await productService.getProductDetail(item.slug);
    } catch (error) {
      if (error.status !== 404) throw error;
      return { products: [], comparison: null, response: { needsClarification: true, requestedName: name, candidates: [] } };
    }
    resolved.push({ product: item, detail, sku: item.variants[0], card: found.products.find(card => card.slug === item.slug) });
  }
  const comparisonInput = resolved.map(({ product, detail, sku }) => ({
    name: product.name, slug: product.slug,
    specifications: detail.specifications ?? [],
    technicalSpecs: detail.technicalSpecs ?? {},
    ram: capacityLabel(sku.ram) ?? 'Chưa có thông tin',
    storage: capacityLabel(sku.storage) ?? 'Chưa có thông tin',
    version: `${capacityLabel(sku.ram) ?? 'RAM chưa có thông tin'} / ${capacityLabel(sku.storage) ?? 'ROM chưa có thông tin'}${sku.color ? ` / ${sku.color}` : ''}`,
    price: `${product.matchingVariantCount > 1 ? 'Từ ' : ''}${sku.price.toLocaleString('vi-VN')}₫`,
  }));
  return { response: { products: comparisonInput }, comparisonInput,
    products: resolved.map(({ card }, index) => ({ ...card, version: comparisonInput[index].version })) };
};

export const executeProductTool = async ({ name, args = {} }) => {
  switch (name) {
    case 'searchProducts':
      return searchProducts(args);
    case 'compareProducts':
      return compareProducts(args);
    default:
      throw new HttpError(400, 'Công cụ không được hỗ trợ.');
  }
};
