// Prototype inputs use reserved mail domains and deliberately non-routable phone data.
// These checks do not send mail/SMS or claim to identify a real person.
export type SyntheticField = "name" | "email" | "phone" | "contact";
export function syntheticError(field: SyntheticField, value: unknown): string {
  if (typeof value !== "string")
    return "Preencha este campo com dados de teste.";
  const text = value.trim();
  if (field === "contact")
    return syntheticError(
      text.includes("@") ? "email" : "phone",
      text.replace(/^Contato fictício\s*[·:]\s*/i, ""),
    );
  if (field === "email") {
    const parts = text.toLowerCase().split("@");
    if (
      parts.length !== 2 ||
      text.length > 120 ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0]) ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(parts[1])
    )
      return "Use um e-mail de teste, como cliente@exemplo.invalid.";
    const domain = parts[1];
    return /\.(invalid|test|example)$/.test(domain) ||
      ["example.com", "example.net", "example.org"].includes(domain)
      ? ""
      : "E-mails reais não são aceitos no protótipo. Use @exemplo.invalid ou outro domínio reservado de teste.";
  }
  if (field === "phone") {
    if (!/^[\d\s()+-]+$/.test(text))
      return "Use um telefone fictício com DDD 00, como (00) 00000-0001.";
    const digits = text.replace(/\D/g, "");
    return /^0{8,11}$/.test(digits) || /^00\d{8,9}$/.test(digits)
      ? ""
      : "Telefones reais não são aceitos. Use DDD 00 e um número de teste.";
  }
  return text.length >= 2 &&
    text.length <= 80 &&
    /\b(teste|exemplo|demo|fict[ií]ci[oa])\b/i.test(text) &&
    /^[\p{L}\p{N}\s._#'-]+$/u.test(text)
    ? ""
    : "Use um nome marcado como teste, por exemplo: Cliente Teste 01.";
}
export const syntheticIdentityValid = (value: {
  name: unknown;
  phone: unknown;
  email: unknown;
}) =>
  !syntheticError("name", value.name) &&
  !syntheticError("phone", value.phone) &&
  !syntheticError("email", value.email);
