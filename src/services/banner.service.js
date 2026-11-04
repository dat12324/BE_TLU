import Banner from "../models/Banner.js";
import { normalizePagination } from "../utils/pagination.js";
import { validateCatalogId } from "../validators/catalog.validator.js";
import { HttpError } from "../utils/http-error.js";

export const BANNER_EDITABLE_FIELDS = [
  "title", "subtitle", "tag", "priceText", "btnText", "image", "link",
  "position", "theme", "tone", "icon", "displayOrder", "status", "startsAt", "endsAt",
];
const publicFields = "title subtitle tag priceText btnText image.url link position theme tone icon displayOrder";

export const listBanners = async (query, admin = false) => {
  const { page, limit } = normalizePagination(query.page, query.limit);
  const filter = {};
  if (query.position) filter.position = query.position;
  if (query.search)
    filter.title = { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (admin) {
    if (query.status) filter.status = query.status;
  } else {
    const now = new Date();
    filter.status = "active";
    filter.$and = [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ];
  }
  const [data, total] = await Promise.all([
    Banner.find(filter).select(admin ? "-__v" : publicFields)
      .sort({ ...(admin ? { position: 1 } : {}), displayOrder: 1, createdAt: -1, _id: 1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Banner.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getBanner = async id => {
  validateCatalogId(id, "banner");
  const banner = await Banner.findById(id).select("-__v").lean();
  if (!banner) throw new HttpError(404, "Không tìm thấy banner.");
  return banner;
};

export const createBanner = async (data, adminId) => {
  const fields = Object.fromEntries(BANNER_EDITABLE_FIELDS.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
  const banner = new Banner({ ...fields, createdBy: adminId, updatedBy: adminId });
  await banner.save();
  const result = banner.toObject();
  delete result.__v;
  return result;
};

export const updateBanner = async (id, data, adminId) => {
  validateCatalogId(id, "banner");
  const banner = await Banner.findById(id);
  if (!banner) throw new HttpError(404, "Không tìm thấy banner.");
  for (const key of BANNER_EDITABLE_FIELDS)
    if (data[key] !== undefined) banner.set(key, data[key]);
  banner.updatedBy = adminId;
  await banner.save();
  const result = banner.toObject();
  delete result.__v;
  return result;
};
