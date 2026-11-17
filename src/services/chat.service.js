import { gemini } from '../config/gemini.js';
import { productFunctionDeclarations, executeProductFunctionCall } from '../utils/gemini-tools.js';
import { HttpError } from '../utils/http-error.js';

export const sendChatMessage = async (message, history = []) => {
  if (typeof message !== 'string' || !message.trim() || message.length > 1000 ||
      !Array.isArray(history) || history.length > 10 || history.some(item =>
        !item || !['user', 'assistant'].includes(item.role) ||
        typeof item.content !== 'string' || !item.content.trim() || item.content.length > 2000)) {
    throw new HttpError(400, 'Câu hỏi tối đa 1.000 ký tự và lịch sử tối đa 10 tin nhắn hợp lệ.');
  }
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
    throw new HttpError(503, 'Trợ lý AI chưa được cấu hình.');
  }
  const contents = history.map(item => ({
    role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: message.trim() }] });
  const products = new Map();
  for (let turn = 0; turn < 3; turn += 1) {
    let result;
    try {
      result = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL,
        contents,
        config: {
          httpOptions: { timeout: 20000 }, maxOutputTokens: 768,
          systemInstruction: 'Bạn là trợ lý mua điện thoại TLUPhone. Trả lời tiếng Việt ngắn gọn. Khi tư vấn sản phẩm, giá hoặc tồn kho, luôn dùng searchProducts lấy dữ liệu mới; không tin thông tin sản phẩm trong lịch sử. Không bịa sản phẩm, giá, thông số hay chính sách cửa hàng. Không có kết quả thì nói rõ và hỏi khách muốn đổi tiêu chí nào, không tự bỏ bộ lọc. Thẻ sản phẩm được giao diện hiển thị riêng nên không chèn ảnh, URL hay danh sách dài vào câu trả lời. Hướng dẫn khách nhấn thẻ để chọn RAM/ROM, màu và mua hàng ở trang chi tiết. Với yêu cầu pin trâu hoặc pin tốt nhất, gọi searchProducts với sort=battery_desc, limit=5, inStock=true và không tự thêm tags=battery. Giữ các tiêu chí khác nếu khách có yêu cầu. Giải thích kết quả xếp theo dung lượng pin mAh, không khẳng định thời lượng sử dụng thực tế. Không thực hiện đặt hàng hoặc truy cập dữ liệu tài khoản.',
          tools: [{ functionDeclarations: productFunctionDeclarations }],
          toolConfig: { functionCallingConfig: { mode: turn === 2 ? 'NONE' : 'AUTO' } },
        },
      });
    } catch {
      throw new HttpError(503, 'Trợ lý AI đang bận. Vui lòng thử lại sau.');
    }
    const calls = result.functionCalls ?? [];
    if (!calls.length) {
      const text = result.text?.trim();
      if (!text) throw new HttpError(503, 'Trợ lý AI chưa trả lời được. Vui lòng thử lại.');
      return { message: text, products: [...products.values()].slice(0, 10) };
    }
    if (turn === 2 || calls.length > 3) break;
    // Giữ nguyên content của model, bao gồm thought signature cho Gemini Function Calling.
    contents.push(result.candidates[0].content);
    const parts = [];
    for (const call of calls) {
      let response;
      try {
        const found = await executeProductFunctionCall(call);
        response = found.response;
        found.products.forEach(product => products.set(product.slug, product));
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 400) throw error;
        response = { error: error.message };
      }
      parts.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } });
    }
    contents.push({ role: 'user', parts });
  }
  throw new HttpError(503, 'Vui lòng hỏi cụ thể hơn về nhu cầu hoặc ngân sách của bạn.');
};
