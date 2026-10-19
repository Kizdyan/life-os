import { useState } from "react";
import { metricLabels, presentDiagnostic, type DiveMInput, type EvidenceState, type DiveMView } from "./divemPresenter";
import "./divemDiagnostic.css";

const initial: DiveMInput = { profile_clarity: "", content_consistency: "", audience_response: "" };
const initialEvidence: Record<string, EvidenceState> = { profile_clarity: "UNVERIFIED", content_consistency: "UNVERIFIED", audience_response: "UNVERIFIED" };

export default function DiveMDiagnostic() {
  const [input, setInput] = useState<DiveMInput>(initial);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [view, setView] = useState<DiveMView>({ kind: "empty", message: "Добавьте минимум два проверенных показателя.", unverified: [] });

  function analyze() { setView(presentDiagnostic(input, evidence)); }
  const unverified = view.kind === "invalid" ? [] : view.unverified;

  return <main className="divemPage">
    <header className="divemHeader"><a href="#">← Life OS</a><div><small>DIVEM · LOCAL DIAGNOSTIC</small><h1>Проверить основу стратегии</h1></div></header>
    <p className="divemLead">Введите значения только после проверки. Не подтверждённые цифры остаются вне расчёта, а неизвестное не превращается в вывод.</p>

    <section className="divemForm" aria-label="Исходные диагностические данные">
      {Object.entries(metricLabels).map(([key, label]) => <label key={key}>
        <span>{label}</span>
        <input inputMode="decimal" aria-label={label} placeholder="Например, 0,75" value={input[key]} onChange={event => setInput(current => ({ ...current, [key]: event.target.value }))} />
        <select aria-label={`Источник показателя: ${label}`} value={evidence[key]} onChange={event => setEvidence(current => ({ ...current, [key]: event.target.value as EvidenceState }))}>
          <option value="UNVERIFIED">Источник не подтверждён</option><option value="VERIFIED">Проверено вручную</option>
        </select>
      </label>)}
      <button className="divemAnalyze" onClick={analyze}>Проверить данные</button>
    </section>

    <section className="divemResult" aria-live="polite">
      {view.kind === "empty" && <><p>{view.message}</p>{unverified.length > 0 && <p className="divemEvidenceNote">Не учтено без источника: {unverified.map(name => metricLabels[name]).join(", ")}.</p>}</>}
      {view.kind === "invalid" && <p className="divemError">{view.message}</p>}
      {view.kind === "result" && view.result.state === "UNKNOWN" && <><span className="divemState unknown">Недостаточно данных</span><h2>Вывод пока неизвестен</h2><p>Нужны минимум два проверенных показателя. Ничего не рассчитано по предположениям.</p></>}
      {view.kind === "result" && view.result.state === "ACTIONABLE" && <><span className="divemState">Проверенные данные</span><h2>Media Score {view.result.score}</h2><dl>{view.result.components.map(component => <div key={component.name}><dt>{metricLabels[component.name] || component.name}</dt><dd>{component.value} <small>{component.evidenceState}</small></dd></div>)}</dl><p><b>Первый фокус:</b> {metricLabels[view.result.weakestComponent || ""] || view.result.weakestComponent}.</p><p className="divemRecommendation">Начните с показателя «{metricLabels[view.result.weakestComponent || ""] || view.result.weakestComponent}», прежде чем менять другие тактики.</p></>}
      {unverified.length > 0 && <p className="divemEvidenceNote">Не учтено без подтверждённого источника: {unverified.map(name => metricLabels[name]).join(", ")}.</p>}
    </section>
    <aside className="divemLimit"><b>Граница результата</b><span>Это локальная предварительная диагностика в текущем браузере. Она не сохраняет профиль, не обращается к платформам и не заменяет проверку реальных данных.</span></aside>
  </main>;
}
