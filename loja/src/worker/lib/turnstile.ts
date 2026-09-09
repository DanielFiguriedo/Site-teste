import type { Env } from "../env";
import { requisicaoInvalida } from "./erros";

const URL_VERIFICACAO = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Valida o token do Turnstile.
 *
 * Sem isso, um script conseguiria criar milhares de cobranças Pix por minuto —
 * o que suja o painel do gateway e pode derrubar a conta. A verificação só é
 * exigida quando a chave está configurada, para o ambiente de desenvolvimento
 * continuar utilizável sem widget.
 */
export async function verificarTurnstile(
  env: Env,
  token: string | undefined,
  ip: string | undefined,
): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;

  if (!token) throw requisicaoInvalida("Confirme que você não é um robô.");

  const formulario = new FormData();
  formulario.append("secret", env.TURNSTILE_SECRET_KEY);
  formulario.append("response", token);
  if (ip) formulario.append("remoteip", ip);

  const resposta = await fetch(URL_VERIFICACAO, { method: "POST", body: formulario });
  const resultado = (await resposta.json()) as { success: boolean };

  if (!resultado.success) {
    throw requisicaoInvalida("Verificação anti-robô falhou. Recarregue a página e tente de novo.");
  }
}
