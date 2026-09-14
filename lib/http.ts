export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readApiResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(
      response.status === 413
        ? "Ảnh vượt giới hạn dung lượng máy chủ."
        : `API chưa sẵn sàng (HTTP ${response.status}). Vui lòng kiểm tra deployment và cấu hình máy chủ.`,
      response.status,
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error || "Không thể kết nối máy chủ",
      response.status,
    );
  return data;
}
