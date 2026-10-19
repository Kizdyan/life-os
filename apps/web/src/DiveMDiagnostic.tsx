import { useState } from "react";
import { metricLabels, presentDiagnostic, type DiveMInput, type DiveMView } from "./divemPresenter";
import "./divemDiagnostic.css";

const initial: DiveMInput = {
  profile_clarity: "",
  content_consistency: "",
  audience_response: "",
};

export default function DiveMDiagnostic() {
  const [input, setInput] = useState<DiveMInput>(initial);
  const [view, setView] = useState<DiveMView>({ kind: "empty", message: "Добавьте минимум два проверенных показателя." });

  function analyze() {
    setView(presentDiagnostic(input));
  }

  return <main className="divemPage">
    <header className="divemHeader">
      <a href="#">← Life OS</a>
      <div><small>DIVEM · LOCAL DIAGNOSTIC</small><h1>Проверить основу стратегии</h1></div>
    </header>
    <p className="divemLead">Введите только измеренные значения. DiveM не достраивает неизвестные цифры и не выдаёт гипотезы за аналитику.</p>

    <section className="divemForm" aria-label="Исходные диагностические данные">
      {Object.entries(metricLabels).map(([key, label]) => <label key={key}>
        <span>{label}</span>
        <input
          inputMode="decimal"
          aria-label={label}
          placeholder="Например, 0,75"
          value={input[key]}
          onChange={event => setInput(current => ({ ...current, [key]: event.target.value }))}
        />
        <small>Проверенное значение от 0 до 1</small>
      </label>)}
      <button className="divemAnalyze" onClick={analyze}>Проверить данные</button>
    </section>

    <section className="divemResult" aria-live="polite">
      {view.kind === "empty" && <p>{view.message}</p>}
      {view.kind === "invalid" && <p className="divemError">{view.message}</p>}
      {view.kind === "result" && view.result.state === "UNKNOWN" && <>
        <span className="divemState unknown">Недостаточно данных</span>
        <h2>Вывод пока неизвестен</h2>
        <p>Нужны минимум два проверенных показателя. Ничего не рассчитано по предположениям.</p>
      </>}
      {view.kind === "result" && view.result.state === "ACTIONABLE" && <>
        <span className="divemState">Проверенные данные</span>
        <h2>Media Score {view.result.score}</h2>
        <dl>{view.result.components.map(component => <div key={component.name}>
          <dt>{metricLabels[component.name] || component.name}</dt>
          <dd>{component.value} <small>{component.evidenceState}</small></dd>
        </div>)}</dl>
        <p><b>Первый фокус:</b> {metricLabels[view.result.weakestComponent || ""] || view.result.weakestComponent}.</p>
        <p className="divemRecommendation">Начните с показателя «{metricLabels[view.result.weakestComponent || ""] || view.result.weakestComponent}», прежде чем менять другие тактики.</p>
      </>}
    </section>

    <aside className="divemLimit"><b>Граница результата</b><span>Это локальная предварительная диагностика в текущем браузере. Она не сохраняет профиль, не обращается к платформам и не заменяет проверку реальных данных.</span></aside>
  </main>;
}
