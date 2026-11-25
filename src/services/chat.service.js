import { gemini, CHATBOT_SYSTEM_PROMPT } from '../config/gemini.js';
import { productTools, executeProductTool } from '../utils/gemini-tools.js';
import { HttpError } from '../utils/http-error.js';

const selectProductsTool = {
  name: 'selectProducts',
  description: 'Kết thúc tìm kiếm bằng câu trả lời ngắn. Với resultMode=list, gửi slug các máy trong trang và giới thiệu danh sách chung. Với recommend, chỉ gửi slug những máy đã chọn tư vấn. Nếu cần hỏi lại, gửi slugs rỗng.',
  parametersJsonSchema: {
    type: 'object', required: ['reply', 'slugs'], additionalProperties: false,
    properties: {
      reply: { type: 'string', description: 'Nhận xét có căn cứ từ dữ liệu công cụ, nêu lý do chọn và hạn chế theo cùng tiêu chí cho mọi máy. Nếu sửa nhận xét trước, nói rõ điểm đã sửa.' },
      slugs: { type: 'array', maxItems: 10, items: { type: 'string' },
        description: 'Slug các máy đã chọn, theo thứ tự muốn hiển thị thẻ. Không tự tạo slug.' },
    },
  },
};

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
  let searchResult = null;
  for (let turn = 0; turn < 3; turn += 1) {
    const choosingProducts = products.size > 0 && !comparisonInput;
    let result;
    try {
      result = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL,
        contents,
        config: {
          httpOptions: { timeout: 20000 }, maxOutputTokens: 768,
          systemInstruction: CHATBOT_SYSTEM_PROMPT,
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
            tools: [{ functionDeclarations: choosingProducts
              ? [...productTools, selectProductsTool] : productTools }],
            toolConfig: { functionCallingConfig: choosingProducts
              ? { mode: 'ANY', allowedFunctionNames: turn === 2 ? ['selectProducts']
                : [...productTools.map(tool => tool.name), 'selectProducts'] }
              : { mode: turn === 2 ? 'NONE' : 'AUTO' } },
          }),
        },
      });
    } catch {
      throw new HttpError(503, 'Trợ lý AI đang bận. Vui lòng thử lại sau.');
    }
    const calls = result.functionCalls ?? [];
    if (calls.length === 1 && calls[0].name === 'selectProducts' && choosingProducts) {
      const { reply, slugs } = calls[0].args ?? {};
      if (typeof reply !== 'string' || !reply.trim() || !Array.isArray(slugs) || slugs.length > 10 ||
          slugs.some(slug => typeof slug !== 'string' || !products.has(slug))) {
        throw new HttpError(503, 'Danh sách sản phẩm tư vấn chưa hợp lệ. Vui lòng thử lại.');
      }
      const listing = searchResult?.resultMode === 'list' && slugs.length > 0;
      const cards = listing ? searchResult.products
        : [...new Set(slugs)].map(slug => products.get(slug));
      const text = reply.trim();
      return { reply: text, message: text, products: cards, comparison: null,
        ...(listing && searchResult.nextPage ? {
          nextPage: `Xem thêm điện thoại. Gọi searchProducts với đúng bộ lọc và trang tiếp theo: ${JSON.stringify(searchResult.nextPage)}`,
        } : {}),
      };
    }
    if (!calls.length) {
      if (choosingProducts) {
        throw new HttpError(503, 'Trợ lý AI chưa chọn được sản phẩm tư vấn. Vui lòng thử lại.');
      }
      let text = result.text?.trim();
      if (!text) throw new HttpError(503, 'Trợ lý AI chưa trả lời được. Vui lòng thử lại.');
      if (comparisonInput) {
        let answer;
        try { answer = JSON.parse(text); } catch {
          throw new HttpError(503, 'Bảng so sánh chưa hợp lệ. Vui lòng thử lại.');
        }
        if (!answer || typeof answer.reply !== 'string' || !answer.reply.trim() ||
            !Array.isArray(answer.rows) || !answer.rows.length || answer.rows.length > 6 || answer.rows.some(row =>
              !row || typeof row.label !== 'string' || !row.label.trim() ||
              !Array.isArray(row.values) || row.values.length !== comparisonInput.length ||
              row.values.some(value => typeof value !== 'string'))) {
          throw new HttpError(503, 'Bảng so sánh chưa hợp lệ. Vui lòng thử lại.');
        }
        text = answer.reply.trim();
        comparison = {
          products: comparisonInput.map(({ name, slug }) => ({ name, slug })),
          rows: [
            ...answer.rows
              .filter(row => !/^(giá(?:\s|$)|price(?:\s|$))/i.test(row.label.trim()))
              .map((row, index) => ({ key: `spec-${index}`, label: row.label, values: row.values })),
            ...[['ram', 'RAM'], ['storage', 'Bộ nhớ trong'], ['version', 'Phiên bản so sánh'], ['price', 'Giá bán']]
              .map(([key, label]) => ({ key, label, values: comparisonInput.map(product => product[key]) })),
          ],
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
        const found = await executeProductTool(call);
        response = found.response;
        if (call.name === 'searchProducts') searchResult = found;
        if (call.name === 'compareProducts') {
          searchResult = null;
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
