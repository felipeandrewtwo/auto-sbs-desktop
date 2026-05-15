import type { VagaAnalisada } from "@/types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = "Falha na requisicao";
    try {
      const body = await response.json();
      message = body?.message || message;
    } catch {
      // noop
    }
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Resposta invalida da API.", response.status);
  }
}

export async function login(email: string, senha: string): Promise<string> {
  const data = await request<{
    token?: string;
    access_token?: string;
    jwt?: string;
    data?: { token?: string; access_token?: string; jwt?: string };
  }>(
    "/auth/login",
    {
    method: "POST",
    body: JSON.stringify({ email, senha }),
    },
  );

  const token =
    data.token || data.access_token || data.jwt || data.data?.token || data.data?.access_token || data.data?.jwt;
  if (!token) {
    throw new ApiError("Login realizado, mas a API nao retornou token.", 500);
  }

  return token;
}

export async function fetchAnalises(token: string): Promise<VagaAnalisada[]> {
  const data = await request<{ analises: VagaAnalisada[] }>("/analises", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return [...(data.analises || [])].sort(
    (a, b) => (b.porcentagemAlinhamento || 0) - (a.porcentagemAlinhamento || 0),
  );
}
