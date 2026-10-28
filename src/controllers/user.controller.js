import * as userService from "../services/user.service.js";
import { toCustomerUserDTO } from "../dto/user.dto.js";
import { HttpError } from "../utils/http-error.js";

export const updateMyAvatar = async (req, res) => {
  if (!req.file) throw new HttpError(400, "Vui lòng chọn tệp ảnh.");
  const result = await userService.updateAvatar(
    req.user._id,
    { url: req.file.path, publicId: req.file.filename },
    req.user,
  );
  req.uploadCommitted = true;
  res.json(result);
};

export const userController = {
  getMe(req, res) {
    res.json({ user: toCustomerUserDTO(req.user) });
  },
  async updateMe(req, res) {
    const { fullName, phoneNumber, dateOfBirth, gender } = req.body;
    res.json({
      user: await userService.updateProfile(
        req.user._id,
        fullName,
        phoneNumber,
        dateOfBirth,
        gender,
      ),
    });
  },
  listMyAddresses(req, res) {
    res.json({ data: toCustomerUserDTO(req.user).addresses });
  },
  async addMyAddress(req, res) {
    const {
      recipientName,
      phoneNumber,
      streetAddress,
      ward,
      district,
      city,
      isDefault,
    } = req.body;
    res
      .status(201)
      .json({
        user: await userService.addAddress(
          req.user._id,
          recipientName,
          phoneNumber,
          streetAddress,
          ward,
          district,
          city,
          isDefault,
        ),
      });
  },
  async updateMyAddress(req, res) {
    const {
      recipientName,
      phoneNumber,
      streetAddress,
      ward,
      district,
      city,
      isDefault,
    } = req.body;
    res.json({
      user: await userService.updateAddress(
        req.user._id,
        req.params.addressId,
        recipientName,
        phoneNumber,
        streetAddress,
        ward,
        district,
        city,
        isDefault,
      ),
    });
  },
  async removeMyAddress(req, res) {
    res.json({
      user: await userService.removeAddress(req.user._id, req.params.addressId),
    });
  },
  async listAdmin(req, res) {
    const { page, limit, search, isActive } = req.query;
    res.json(await userService.listUsers(page, limit, search, isActive));
  },
  async getAdmin(req, res) {
    res.json({ data: await userService.getUser(req.params.id) });
  },
  async updateStatus(req, res) {
    res.json({
      data: await userService.updateUserStatus(
        req.params.id,
        req.body.isActive,
      ),
    });
  },
};
