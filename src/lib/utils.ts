/**
 * ============================================================================
 * utils.ts — Helpers genéricos (1 função: cn)
 * ============================================================================
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta classes Tailwind de forma inteligente.
 *
 * - `clsx` aceita strings, objetos { 'classe': condicional }, arrays, etc.
 * - `twMerge` resolve conflitos do Tailwind ("p-2 p-4" vira "p-4").
 *
 * @example
 *   cn("p-2", isActive && "bg-primary", { "text-red": hasError })
 *
 * @param inputs Lista de classes / condicionais
 * @returns String final pronta para o atributo className
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
