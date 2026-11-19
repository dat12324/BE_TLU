import { gemini } from '../config/gemini.js';
import { productFunctionDeclarations, executeProductFunctionCall } from '../utils/gemini-tools.js';
import { HttpError } from '../utils/http-error.js';


const SYSTEM_PROMPT = `
Bạn là trợ lý AI của TLUPhone, chuyên tư vấn điện thoại và
giải đáp kiến thức công nghệ. Trả lời tiếng Việt tự nhiên,
thân thiện, ngắn gọn như nhân viên tư vấn thực tế.

1. KIẾN THỨC CÔNG NGHỆ
- Tự giải đáp các câu hỏi chung về chip, CPU, GPU, camera,
  màn hình, pin, Android, iOS và so sánh công nghệ.
- Không yêu cầu tên điện thoại khi khách chỉ hỏi về chip.
- Không cần truy vấn sản phẩm cho câu hỏi kiến thức chung.
- Nếu thông tin chưa chắc chắn, nói rõ, không tự bịa.

2. DỮ LIỆU TLUPhone
- Khi hỏi về sản phẩm, giá, phiên bản hoặc tồn kho tại cửa hàng,
  phải dùng Function Calling lấy dữ liệu thực tế từ Backend.
- Dùng searchProducts để tìm kiếm và kiểm tra tồn kho;
  compareProducts để so sánh 2–3 mẫu điện thoại.
- Không bịa thông số, giá, tồn kho hoặc chính sách cửa hàng.
- Không dùng lịch sử trò chuyện làm nguồn giá hoặc tồn kho hiện tại.

3. TƯ VẤN SẢN PHẨM
- Hiểu nhu cầu và ngân sách của khách trước khi tư vấn.
- Nếu thiếu thông tin quan trọng, hỏi tối đa một câu;
  không vừa hỏi ngân sách vừa đề xuất sản phẩm.
- Khi đủ thông tin, tìm 3–5 sản phẩm phù hợp và giải thích
  ngắn gọn lý do lựa chọn dựa trên dữ liệu thực tế.
- Không khẳng định máy chụp đẹp, chơi game tốt hay pin bền
  chỉ dựa vào MP, tên chip hoặc dung lượng mAh.
- Với yêu cầu pin trâu nhất, dùng searchProducts với
  sort=battery_desc, limit=5, inStock=true;
  không tự thêm tags=battery.
- Không tự bỏ các tiêu chí khách đã yêu cầu.
- Nếu không có sản phẩm phù hợp, nói rõ và hỏi khách
  có muốn thay đổi tiêu chí không.

4. SO SÁNH ĐIỆN THOẠI
- Dùng compareProducts và đối chiếu specifications,
  technicalSpecs cùng phiên bản SKU thực tế.
- Chỉ nhận xét dựa trên dữ liệu có căn cứ.
- Thiếu thông số thì ghi "Chưa có thông tin".
- Nếu needsClarification=true, hỏi lại khách.
- Không tạo bảng Markdown vì Frontend hiển thị bảng riêng.
- Kết luận ngắn gọn theo nhu cầu và sự đánh đổi giữa các máy.

5. TỒN KHO VÀ HIỂN THỊ
- Khi hỏi còn hàng, dùng searchProducts với
  checkAvailability=true và bộ lọc phiên bản tương ứng.
- Phân biệt in_stock, out_of_stock, unknown và
  no_matching_active_variant; không đánh đồng các trạng thái.
- Product Cards được Frontend hiển thị riêng.
  Không lặp lại danh sách tên và giá dài dòng.
- Hướng dẫn khách nhấn thẻ để xem chi tiết và chọn phiên bản.
- Không thực hiện đặt hàng hoặc truy cập tài khoản.
`;



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
  let comparison = null;
  let comparisonInput = null;
  for (let turn = 0; turn < 3; turn += 1) {
    let result;
    try {
      result = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL,
        contents,
        config: {
          httpOptions: { timeout: 20000 }, maxOutputTokens: 768,
          systemInstruction: SYSTEM_PROMPT,
          ...(comparisonInput ? {
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object', required: ['reply', 'rows'], properties: {
                reply: { type: 'string' },
                rows: { type: 'array', minItems: 1, maxItems: 6, items: {
                  type: 'object', required: ['label', 'values'], properties: {
                    label: { type: 'string' },
                    values: { type: 'array', minItems: comparisonInput.length, maxItems: comparisonInput.length,
                      items: { type: 'string' } },
                  },
                } },
              },
            },
          } : {
            tools: [{ functionDeclarations: productFunctionDeclarations }],
            toolConfig: { functionCallingConfig: { mode: turn === 2 ? 'NONE' : 'AUTO' } },
          }),
        },
      });
    } catch {
      throw new HttpError(503, 'Trợ lý AI đang bận. Vui lòng thử lại sau.');
    }
    const calls = result.functionCalls ?? [];
    if (!calls.length) {
      let text = result.text?.trim();
      if (!text) throw new HttpError(503, 'Trợ lý AI chưa trả lời được. Vui lòng thử lại.');
      if (comparisonInput) {
        let answer;
        try { answer = JSON.parse(text); } catch {
          throw new HttpError(503, 'Bảng so sánh chưa hợp lệ. Vui lòng thử lại.');
        }
        const sourceValues = comparisonInput.map(product => [
          'Chưa có thông tin', ...Object.values(product.technicalSpecs).map(String),
          ...product.specifications.flatMap(group => (group.items ?? []).map(item => item.value)),
        ]);
        if (typeof answer.reply !== 'string' || !answer.reply.trim() ||
            !Array.isArray(answer.rows) || !answer.rows.length || answer.rows.length > 6 || answer.rows.some(row =>
              !row || typeof row.label !== 'string' || !row.label.trim() ||
              !Array.isArray(row.values) || row.values.length !== comparisonInput.length ||
              row.values.some((value, index) => !sourceValues[index].includes(value)))) {
          throw new HttpError(503, 'Bảng so sánh chưa khớp dữ liệu sản phẩm. Vui lòng thử lại.');
        }
        text = answer.reply.trim();
        comparison = {
          products: comparisonInput.map(({ name, slug }) => ({ name, slug })),
          rows: [
            ...answer.rows.map((row, index) => ({ key: `spec-${index}`, label: row.label, values: row.values })),
            ...[['ram', 'RAM'], ['storage', 'Bộ nhớ trong'], ['version', 'Phiên bản so sánh'], ['price', 'Giá bán']]
              .map(([key, label]) => ({ key, label, values: comparisonInput.map(product => product[key]) })),
          ],
          priceNote: 'Giá theo phiên bản ghi trong bảng. “Từ” là giá thấp nhất của các SKU đang bán khớp yêu cầu.',
        };
      }
      return { reply: text, message: text, products: [...products.values()].slice(0, 10), comparison };
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
        if (call.name === 'compareProducts') {
          comparisonInput = found.comparisonInput ?? null;
          comparison = null;
          products.clear();
        }
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
