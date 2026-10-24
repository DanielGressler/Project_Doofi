import { $ } from "./browser";
import type { QueueEntry } from "./order-queue";

// In-page notifications only: no external push service, contact data or background worker.
export function createOrderAlerts() {
  let enabled = false;
  let audio: AudioContext | null = null;
  let seen: Set<string> | null = null;
  const button = $<HTMLButtonElement>("#enable-order-alerts");
  button.onclick = async () => {
    if (enabled) {
      enabled = false;
      button.setAttribute("aria-pressed", "false");
      button.textContent = "Ativar som de novos pedidos";
      $("#alert-status").textContent =
        "Som desativado. Os avisos visuais continuam ativos.";
      return;
    }
    try {
      audio ??= new AudioContext();
      await audio.resume();
      if (audio.state !== "running") throw new Error("AUDIO_UNAVAILABLE");
      enabled = true;
      button.setAttribute("aria-pressed", "true");
      button.textContent = "Desativar som de novos pedidos";
      $("#alert-status").textContent =
        "Som ativado para novas chegadas enquanto este painel estiver aberto.";
    } catch {
      $("#alert-status").textContent =
        "O navegador bloqueou o som. Os avisos visuais continuam funcionando.";
    }
  };
  return {
    update(queue: QueueEntry[]) {
      const signatures = queue.map((entry) => `${entry.id}:${entry.status}`);
      const arrived =
        seen !== null && signatures.some((key) => !seen!.has(key));
      // Keep a bounded memory of arrivals; version-only refreshes never ring again.
      seen = new Set([...(seen ?? []), ...signatures].slice(-512));
      if (
        !arrived ||
        !enabled ||
        !audio ||
        audio.state !== "running" ||
        document.hidden
      )
        return;
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.09, audio.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.32);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    },
  };
}
