import ky from "ky";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const api = ky.create({
  prefixUrl: API_BASE_URL,
  timeout: 30000,
  retry: {
    limit: 2,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
  hooks: {
    beforeError: [
      async (error) => {
        const { response } = error;
        if (response && response.body) {
          try {
            const body = (await response.clone().json()) as { error?: Array<{ message: string }> };
            if (body.error?.[0]?.message) {
              (error as any).message = body.error[0].message;
            }
          } catch {
            // ignore parse errors
          }
        }
        return error;
      },
    ],
  },
});

// extracts first error message from api response error array
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

export default api;
