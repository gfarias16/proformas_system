
import { useEffect, useMemo, useState } from "react";
import clientLogo from "../img/logo.png";

const API_BASE = "/api";
const DASHBOARD_COLUMNS = ["proforma", "cliente", "mes_contabil", "bu", "status", "valor_bruto_brl"];
const CHANGE_COLUMNS = ["id", "proforma", "campo", "novo_valor", "status_solicitacao", "requested_by"];
const CLIENT_COLUMNS = ["nome", "cnpj", "email", "telefone", "ativo"];
const USER_COLUMNS = ["nome", "email", "perfil", "ativo"];

const EMPTY_PROFORMA_FORM = {
  proforma: "",
  cliente: "",
  bu: "",
  mes_contabil: "",
  status: "PENDENTE",
  observacoes: "",
  details: "",
  well_project: "",
  valor_bruto_brl: "",
  valor_liquido_brl: "",
};

const EMPTY_CLIENT_FORM = { nome: "", cnpj: "", contato: "", email: "", telefone: "", observacoes: "" };
const EMPTY_USER_FORM = { nome: "", email: "", perfil: "analista" };

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function decimal4(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueOptions(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function groupMetric(rows, field, metric = "valor_total_considerado") {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = row[field] || "Não informado";
    grouped.set(key, (grouped.get(key) || 0) + num(row[metric] ?? row.valor_bruto_brl));
  });
  return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupCount(rows, field) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = row[field] || "Não informado";
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });
  return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function exportUrl(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
  const query = params.toString();
  return `${API_BASE}/reports/proformas.xlsx${query ? `?${query}` : ""}`;
}

async function readJson(response) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("proformas-theme") || "dark");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [proformas, setProformas] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [fxQuote, setFxQuote] = useState(null);
  const [fxCalc, setFxCalc] = useState({ amount: "1000", direction: "USD_TO_BRL", result: null });
  const [filters, setFilters] = useState({ mes_contabil: "", bu: "", cliente: "", status: "" });
  const [tableSearch, setTableSearch] = useState("");
  const [tableStatusFilter, setTableStatusFilter] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [proformaForm, setProformaForm] = useState(EMPTY_PROFORMA_FORM);
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT_FORM);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [changeForm, setChangeForm] = useState({ proforma_record_id: "", campo: "status", novo_valor: "", requested_by: "analista" });
  const [approvalForm, setApprovalForm] = useState({ requestId: "", reviewed_by: "gestor", review_notes: "" });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("proformas-theme", theme);
  }, [theme]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setTablePage(1);
  }, [tableSearch, tableStatusFilter, filters]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [p, c, cl, u] = await Promise.all([
        fetch(`${API_BASE}/proformas`).then(readJson),
        fetch(`${API_BASE}/change-requests`).then(readJson),
        fetch(`${API_BASE}/clients`).then(readJson),
        fetch(`${API_BASE}/users`).then(readJson),
      ]);
      try {
        const fx = await fetch(`${API_BASE}/fx/usd-brl/current`).then(readJson);
        setFxQuote(fx);
      } catch {
        setFxQuote(null);
      }
      setProformas(p);
      setChangeRequests(c);
      setClients(cl);
      setUsers(u);
    } catch {
      setError("Não foi possível carregar os dados da API.");
    } finally {
      setLoading(false);
    }
  }

  const filteredProformas = useMemo(
    () =>
      proformas.filter((row) => {
        if (filters.mes_contabil && row.mes_contabil !== filters.mes_contabil) return false;
        if (filters.bu && row.bu !== filters.bu) return false;
        if (filters.cliente && row.cliente !== filters.cliente) return false;
        if (filters.status && row.status !== filters.status) return false;
        return true;
      }),
    [proformas, filters],
  );

  const months = useMemo(() => uniqueOptions(proformas, "mes_contabil"), [proformas]);
  const bus = useMemo(() => uniqueOptions(proformas, "bu"), [proformas]);
  const clientOptions = useMemo(() => uniqueOptions(proformas, "cliente"), [proformas]);
  const statuses = useMemo(() => uniqueOptions(proformas, "status"), [proformas]);
  const pendingRequests = useMemo(() => changeRequests.filter((item) => item.status_solicitacao === "PENDENTE_REVISAO"), [changeRequests]);

  const summary = useMemo(() => {
    const totalBruto = filteredProformas.reduce((acc, row) => acc + num(row.valor_bruto_brl), 0);
    const totalLiquido = filteredProformas.reduce((acc, row) => acc + num(row.valor_liquido_brl), 0);
    const pendencias = filteredProformas.filter((row) => String(row.status || "").match(/PENDENTE|UNBILLED/i)).length;
    return {
      totalRegistros: filteredProformas.length,
      totalClientes: new Set(filteredProformas.map((row) => row.cliente).filter(Boolean)).size,
      totalBruto,
      totalLiquido,
      pendencias,
      totalImpostos: filteredProformas.reduce((acc, row) => acc + num(row.impostos), 0),
    };
  }, [filteredProformas]);

  const byMonth = useMemo(() => groupMetric(filteredProformas, "mes_contabil").reverse(), [filteredProformas]);
  const byBu = useMemo(() => groupMetric(filteredProformas, "bu").slice(0, 8), [filteredProformas]);
  const topClients = useMemo(() => groupMetric(filteredProformas, "cliente").slice(0, 8), [filteredProformas]);
  const byStatus = useMemo(() => groupCount(filteredProformas, "status"), [filteredProformas]);
  const searchedProformas = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    return filteredProformas.filter((row) => {
      if (tableStatusFilter && row.status !== tableStatusFilter) return false;
      if (!search) return true;
      return String(row.proforma || "").toLowerCase().includes(search) || String(row.cliente || "").toLowerCase().includes(search);
    });
  }, [filteredProformas, tableSearch, tableStatusFilter]);
  const totalTablePages = Math.max(1, Math.ceil(searchedProformas.length / 12));
  const paginatedProformas = useMemo(() => {
    const start = (tablePage - 1) * 12;
    return searchedProformas.slice(start, start + 12);
  }, [searchedProformas, tablePage]);

  async function createItem(url, body, successText, reset) {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(readJson);
      if (reset) reset();
      setSuccess(successText);
      loadData();
    } catch {
      setError("Não foi possível concluir a operação.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runFxCalculation() {
    setError("");
    try {
      const result = await fetch(`${API_BASE}/fx/usd-brl/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(fxCalc.amount || 0), direction: fxCalc.direction }),
      }).then(readJson);
      setFxCalc((prev) => ({ ...prev, result }));
    } catch {
      setError("Não foi possível calcular usando a cotação do Bacen.");
    }
  }

  async function refreshFxQuote() {
    setError("");
    setSuccess("");
    try {
      const fx = await fetch(`${API_BASE}/fx/usd-brl/current`).then(readJson);
      setFxQuote(fx);
      setSuccess("Cotação PTAX atualizada com sucesso.");
    } catch {
      setError("Não foi possível atualizar a cotação PTAX no momento.");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo-wrap">
            <img className="brand-logo" src={clientLogo} alt="Logo da empresa cliente" />
          </div>
          <p className="eyebrow"></p>
          <h1>Proformas Control Center</h1>
          <p className="muted">Dashboard, cadastros, aprovações e relatórios.</p>
        </div>

        <nav className="nav-grid">
          {[
            ["dashboard", "Dashboard"],
            ["cadastros", "Cadastros"],
            ["solicitacoes", "Solicitações"],
            ["aprovacoes", "Aprovações"],
            ["relacionamento", "Clientes e usuários"],
          ].map(([id, label]) => (
            <button key={id} className={`nav-button ${activeSection === id ? "nav-button-active" : ""}`} onClick={() => setActiveSection(id)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-label">Tema</span>
          <div className="theme-toggle">
            <button className={`toggle-chip ${theme === "dark" ? "toggle-chip-active" : ""}`} onClick={() => setTheme("dark")}>Escuro</button>
            <button className={`toggle-chip ${theme === "light" ? "toggle-chip-active" : ""}`} onClick={() => setTheme("light")}>Claro</button>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Ações rápidas</span>
          <a className="sidebar-link" href={exportUrl(filters)}>Baixar relatório Excel</a>
          <button className="ghost-button" onClick={loadData}>Atualizar dados</button>
        </div>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">Operação</p>
            <h2>Painel geral com filtros, visão analítica e gestão operacional</h2>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
        {success ? <div className="success-banner">{success}</div> : null}
        {loading ? <div className="loading-card">Carregando dados...</div> : null}

        {!loading && activeSection === "dashboard" && (
          <>
            <section className="filters-panel">
              <div className="filters-head">
                <div>
                  <p className="eyebrow">Filtros</p>
                  <h3>Refine o dashboard</h3>
                </div>
                <button className="ghost-button small-button" onClick={() => setFilters({ mes_contabil: "", bu: "", cliente: "", status: "" })}>Limpar filtros</button>
              </div>
              <div className="filters-grid">
                <FilterSelect label="Mês contábil" value={filters.mes_contabil} options={months} onChange={(value) => setFilters((prev) => ({ ...prev, mes_contabil: value }))} />
                <FilterSelect label="BU" value={filters.bu} options={bus} onChange={(value) => setFilters((prev) => ({ ...prev, bu: value }))} />
                <FilterSelect label="Cliente" value={filters.cliente} options={clientOptions} onChange={(value) => setFilters((prev) => ({ ...prev, cliente: value }))} />
                <FilterSelect label="Status" value={filters.status} options={statuses} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
              </div>
            </section>

            <section className="metrics-grid metrics-grid-uneven">
              <KpiCard label="Registros" value={summary.totalRegistros} tone="slate" />
              <KpiCard label="Clientes" value={summary.totalClientes} tone="blue" />
              <KpiCard label="Total Bruto" value={currency(summary.totalBruto)} tone="cyan" />
              <KpiCard label="Total Líquido" value={currency(summary.totalLiquido)} tone="teal" />
              <KpiCard label="Pendências" value={summary.pendencias} tone="rose" />
            </section>

            <section className="panel-grid">
              <Panel title="Dólar PTAX" subtitle="Cotação oficial do Banco Central atualizada automaticamente">
                {fxQuote ? (
                  <div className="fx-card">
                    <div className="fx-toolbar">
                      <button className="ghost-button small-button" type="button" onClick={refreshFxQuote}>Atualizar PTAX</button>
                    </div>
                    <div className="fx-grid">
                      <div className="fx-value-box">
                        <span>Compra</span>
                        <strong>{decimal4(fxQuote.cotacao_compra)}</strong>
                      </div>
                      <div className="fx-value-box">
                        <span>Venda</span>
                        <strong>{decimal4(fxQuote.cotacao_venda)}</strong>
                      </div>
                    </div>
                    <p className="muted">Fonte: {fxQuote.fonte}</p>
                    <p className="muted">Data base: {fxQuote.data_consulta}</p>
                  </div>
                ) : (
                  <div className="empty-state">Cotação indisponível no momento.</div>
                )}
              </Panel>

              <Panel title="Calculadora cambial" subtitle="Apoio para futuros cálculos no sistema">
                <div className="form-grid">
                  <Field label="Valor">
                    <input type="number" step="0.01" value={fxCalc.amount} onChange={(e) => setFxCalc((prev) => ({ ...prev, amount: e.target.value }))} />
                  </Field>
                  <Field label="Conversão">
                    <select value={fxCalc.direction} onChange={(e) => setFxCalc((prev) => ({ ...prev, direction: e.target.value }))}>
                      <option value="USD_TO_BRL">USD para BRL</option>
                      <option value="BRL_TO_USD">BRL para USD</option>
                    </select>
                  </Field>
                  <button className="primary-button" type="button" onClick={runFxCalculation}>Calcular</button>
                </div>
                {fxCalc.result ? (
                  <div className="fx-result">
                    <span>Resultado</span>
                    <strong>{fxCalc.direction === "USD_TO_BRL" ? currency(fxCalc.result.result) : `${Number(fxCalc.result.result).toFixed(2)} USD`}</strong>
                    <small>Taxa usada: {decimal4(fxCalc.result.rate)}</small>
                  </div>
                ) : null}
              </Panel>
            </section>

            <section className="panel-grid">
              <Panel title="Evolução por mês" subtitle="Linha de evolução do valor consolidado por mês contábil">
                <LineChart data={byMonth} formatter={currency} />
              </Panel>
              <Panel title="Distribuição por status" subtitle="Clique em um status para filtrar o dashboard">
                <DonutChart data={byStatus} activeLabel={filters.status} onSliceClick={(label) => setFilters((prev) => ({ ...prev, status: prev.status === label ? "" : label }))} />
              </Panel>
            </section>

            <section className="panel-grid">
              <Panel title="Valor por BU" subtitle="Ranking por unidade de negócio em barras horizontais">
                <BarList data={byBu} formatter={currency} />
              </Panel>
              <Panel title="Top clientes" subtitle="Clientes com maior peso no período filtrado">
                <BarList data={topClients} formatter={currency} />
              </Panel>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Base operacional</h3>
                  <p>Dados filtrados atualmente no dashboard</p>
                </div>
              </div>
              <div className="table-controls">
                <label className="field table-search">
                  <span>Busca por nome ou proforma</span>
                  <input type="text" placeholder="Digite cliente ou proforma" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
                </label>
                <FilterSelect label="Status da tabela" value={tableStatusFilter} options={statuses} onChange={setTableStatusFilter} />
              </div>
              <DataTable columns={DASHBOARD_COLUMNS} rows={paginatedProformas} />
              <div className="table-pagination">
                <span>Página {tablePage} de {totalTablePages} | {searchedProformas.length} registro(s)</span>
                <div className="button-row">
                  <button className="ghost-button small-button" type="button" disabled={tablePage === 1} onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}>Anterior</button>
                  <button className="ghost-button small-button" type="button" disabled={tablePage === totalTablePages} onClick={() => setTablePage((prev) => Math.min(totalTablePages, prev + 1))}>Próxima</button>
                </div>
              </div>
            </section>
          </>
        )}

        {!loading && activeSection === "cadastros" && (
          <section className="panel-grid form-layout">
            <Panel title="Nova proforma" subtitle="Cadastro manual direto no banco">
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); createItem(`${API_BASE}/proformas`, { ...proformaForm, valor_bruto_brl: proformaForm.valor_bruto_brl ? Number(proformaForm.valor_bruto_brl) : null, valor_liquido_brl: proformaForm.valor_liquido_brl ? Number(proformaForm.valor_liquido_brl) : null }, "Cadastro de proforma realizado com sucesso.", () => setProformaForm(EMPTY_PROFORMA_FORM)); }}>
                <Field label="Proforma"><input value={proformaForm.proforma} onChange={(e) => setProformaForm((prev) => ({ ...prev, proforma: e.target.value }))} required /></Field>
                <Field label="Cliente"><input value={proformaForm.cliente} onChange={(e) => setProformaForm((prev) => ({ ...prev, cliente: e.target.value }))} /></Field>
                <Field label="BU"><input value={proformaForm.bu} onChange={(e) => setProformaForm((prev) => ({ ...prev, bu: e.target.value }))} /></Field>
                <Field label="Mês contábil"><input value={proformaForm.mes_contabil} onChange={(e) => setProformaForm((prev) => ({ ...prev, mes_contabil: e.target.value }))} /></Field>
                <Field label="Status"><select value={proformaForm.status} onChange={(e) => setProformaForm((prev) => ({ ...prev, status: e.target.value }))}>{["PENDENTE", "UNBILLED", "BILLED"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Valor bruto BRL"><input type="number" step="0.01" value={proformaForm.valor_bruto_brl} onChange={(e) => setProformaForm((prev) => ({ ...prev, valor_bruto_brl: e.target.value }))} /></Field>
                <Field label="Valor líquido BRL"><input type="number" step="0.01" value={proformaForm.valor_liquido_brl} onChange={(e) => setProformaForm((prev) => ({ ...prev, valor_liquido_brl: e.target.value }))} /></Field>
                <Field label="Well / Project"><input value={proformaForm.well_project} onChange={(e) => setProformaForm((prev) => ({ ...prev, well_project: e.target.value }))} /></Field>
                <Field label="Details" full><textarea rows="4" value={proformaForm.details} onChange={(e) => setProformaForm((prev) => ({ ...prev, details: e.target.value }))} /></Field>
                <Field label="Observações" full><textarea rows="4" value={proformaForm.observacoes} onChange={(e) => setProformaForm((prev) => ({ ...prev, observacoes: e.target.value }))} /></Field>
                <button className="primary-button" disabled={submitting}>Salvar cadastro</button>
              </form>
            </Panel>
            <Panel title="Registros recentes" subtitle="Acompanhamento rápido dos últimos cadastros">
              <DataTable columns={DASHBOARD_COLUMNS} rows={proformas.slice(0, 15)} />
            </Panel>
          </section>
        )}

        {!loading && activeSection === "solicitacoes" && (
          <section className="panel-grid form-layout">
            <Panel title="Nova solicitação de alteração" subtitle="Alterações passam por revisão antes de aplicar no registro">
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); createItem(`${API_BASE}/change-requests`, { ...changeForm, proforma_record_id: Number(changeForm.proforma_record_id) }, "Solicitação enviada para aprovação.", () => setChangeForm({ proforma_record_id: "", campo: "status", novo_valor: "", requested_by: "analista" })); }}>
                <Field label="Registro alvo"><select value={changeForm.proforma_record_id} onChange={(e) => setChangeForm((prev) => ({ ...prev, proforma_record_id: e.target.value }))} required><option value="">Selecione</option>{proformas.slice(0, 200).map((item) => <option key={item.id} value={item.id}>{item.proforma} | {item.cliente || "Sem cliente"} | {item.bu || "Sem BU"}</option>)}</select></Field>
                <Field label="Campo"><select value={changeForm.campo} onChange={(e) => setChangeForm((prev) => ({ ...prev, campo: e.target.value }))}>{["status", "cliente", "mes_contabil", "bu", "valor_bruto_brl", "valor_liquido_brl", "observacoes", "details"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Novo valor"><input value={changeForm.novo_valor} onChange={(e) => setChangeForm((prev) => ({ ...prev, novo_valor: e.target.value }))} required /></Field>
                <Field label="Solicitante"><input value={changeForm.requested_by} onChange={(e) => setChangeForm((prev) => ({ ...prev, requested_by: e.target.value }))} /></Field>
                <button className="primary-button" disabled={submitting}>Enviar solicitação</button>
              </form>
            </Panel>
            <Panel title="Histórico de solicitações" subtitle="Fila consolidada de alterações">
              <DataTable columns={CHANGE_COLUMNS} rows={changeRequests.slice(0, 20)} />
            </Panel>
          </section>
        )}

        {!loading && activeSection === "aprovacoes" && (
          <section className="panel-grid form-layout">
            <Panel title="Aprovar ou rejeitar" subtitle="Processamento das solicitações pendentes">
              <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
                <Field label="Solicitação pendente"><select value={approvalForm.requestId} onChange={(e) => setApprovalForm((prev) => ({ ...prev, requestId: e.target.value }))}><option value="">Selecione</option>{pendingRequests.map((item) => <option key={item.id} value={item.id}>#{item.id} | {item.proforma} | {item.campo} | {item.novo_valor}</option>)}</select></Field>
                <Field label="Revisor"><input value={approvalForm.reviewed_by} onChange={(e) => setApprovalForm((prev) => ({ ...prev, reviewed_by: e.target.value }))} /></Field>
                <Field label="Notas" full><textarea rows="4" value={approvalForm.review_notes} onChange={(e) => setApprovalForm((prev) => ({ ...prev, review_notes: e.target.value }))} /></Field>
                <div className="button-row full">
                  <button className="primary-button" type="button" disabled={submitting || !approvalForm.requestId} onClick={() => createItem(`${API_BASE}/change-requests/${approvalForm.requestId}/approve`, { reviewed_by: approvalForm.reviewed_by, review_notes: approvalForm.review_notes }, "Solicitação aprovada com sucesso.", () => setApprovalForm({ requestId: "", reviewed_by: "gestor", review_notes: "" }))}>Aprovar</button>
                  <button className="danger-button" type="button" disabled={submitting || !approvalForm.requestId} onClick={() => createItem(`${API_BASE}/change-requests/${approvalForm.requestId}/reject`, { reviewed_by: approvalForm.reviewed_by, review_notes: approvalForm.review_notes }, "Solicitação rejeitada com sucesso.", () => setApprovalForm({ requestId: "", reviewed_by: "gestor", review_notes: "" }))}>Rejeitar</button>
                </div>
              </form>
            </Panel>
            <Panel title="Pendências" subtitle="Solicitações aguardando decisão">
              <DataTable columns={CHANGE_COLUMNS} rows={pendingRequests.slice(0, 20)} />
            </Panel>
          </section>
        )}

        {!loading && activeSection === "relacionamento" && (
          <section className="panel-grid form-layout">
            <Panel title="Clientes" subtitle="Cadastro de relacionamento">
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); createItem(`${API_BASE}/clients`, clientForm, "Cliente cadastrado com sucesso.", () => setClientForm(EMPTY_CLIENT_FORM)); }}>
                <Field label="Nome"><input value={clientForm.nome} onChange={(e) => setClientForm((prev) => ({ ...prev, nome: e.target.value }))} required /></Field>
                <Field label="CNPJ"><input value={clientForm.cnpj} onChange={(e) => setClientForm((prev) => ({ ...prev, cnpj: e.target.value }))} /></Field>
                <Field label="Contato"><input value={clientForm.contato} onChange={(e) => setClientForm((prev) => ({ ...prev, contato: e.target.value }))} /></Field>
                <Field label="Email"><input value={clientForm.email} onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))} /></Field>
                <Field label="Telefone"><input value={clientForm.telefone} onChange={(e) => setClientForm((prev) => ({ ...prev, telefone: e.target.value }))} /></Field>
                <Field label="Observações" full><textarea rows="4" value={clientForm.observacoes} onChange={(e) => setClientForm((prev) => ({ ...prev, observacoes: e.target.value }))} /></Field>
                <button className="primary-button" disabled={submitting}>Cadastrar cliente</button>
              </form>
              <DataTable columns={CLIENT_COLUMNS} rows={clients.slice(0, 12)} />
            </Panel>
            <Panel title="Usuários" subtitle="Cadastro de perfis de acesso">
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); createItem(`${API_BASE}/users`, userForm, "Usuário cadastrado com sucesso.", () => setUserForm(EMPTY_USER_FORM)); }}>
                <Field label="Nome"><input value={userForm.nome} onChange={(e) => setUserForm((prev) => ({ ...prev, nome: e.target.value }))} required /></Field>
                <Field label="Email"><input value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} /></Field>
                <Field label="Perfil"><select value={userForm.perfil} onChange={(e) => setUserForm((prev) => ({ ...prev, perfil: e.target.value }))}>{["analista", "gestor", "admin"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <button className="primary-button" disabled={submitting}>Cadastrar usuário</button>
              </form>
              <DataTable columns={USER_COLUMNS} rows={users.slice(0, 12)} />
            </Panel>
          </section>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, tone }) {
  return <article className={`kpi-card kpi-card-${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function Panel({ title, subtitle, children }) {
  return <section className="panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{children}</section>;
}

function Field({ label, children, full = false }) {
  return <label className={`field ${full ? "field-full" : ""}`}><span>{label}</span>{children}</label>;
}

function FilterSelect({ label, value, options, onChange }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Todos</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length}>Sem dados.</td></tr> : rows.map((row, index) => (
            <tr key={`${row.id || row.proforma || index}`}>{columns.map((column) => <td key={column}>{column.includes("valor") ? currency(row[column]) : String(row[column] ?? "")}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ data, formatter }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);
  if (!data.length) return <div className="empty-state">Sem dados para exibir no gráfico.</div>;
  return <div className="bar-list">{data.map((item) => <div className="bar-row" key={item.label}><div className="bar-head"><span>{item.label}</span><strong>{formatter(item.value)}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: `${(item.value / maxValue) * 100}%` }} /></div></div>)}</div>;
}

function LineChart({ data, formatter }) {
  const [hoveredLabel, setHoveredLabel] = useState(data[0]?.label || "");

  useEffect(() => {
    setHoveredLabel(data[0]?.label || "");
  }, [data]);

  if (!data.length) return <div className="empty-state">Sem dados para exibir no gráfico.</div>;
  const width = 100;
  const height = 42;
  const max = Math.max(...data.map((item) => item.value), 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((item, index) => `${index * stepX},${height - (item.value / max) * height}`).join(" ");
  const hoveredPoint = data.find((item) => item.label === hoveredLabel) || data[0];
  return (
    <div className="line-chart">
      <div className="chart-tooltip"><span>{hoveredPoint.label}</span><strong>{formatter(hoveredPoint.value)}</strong></div>
      <svg viewBox={`0 0 ${width} ${height + 4}`} className="line-chart-svg" preserveAspectRatio="none">
        <polyline points={points} fill="none" className="line-chart-path" />
        {data.map((item, index) => (
          <circle key={item.label} cx={index * stepX} cy={height - (item.value / max) * height} r="1.9" className={`line-chart-dot ${hoveredPoint.label === item.label ? "line-chart-dot-active" : ""}`} onMouseEnter={() => setHoveredLabel(item.label)}>
            <title>{`${item.label}: ${formatter(item.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="line-chart-grid">{data.map((item) => <div className="line-chart-point" key={item.label}><span>{item.label}</span><strong>{formatter(item.value)}</strong></div>)}</div>
    </div>
  );
}

function DonutChart({ data, activeLabel, onSliceClick }) {
  if (!data.length) return <div className="empty-state">Sem dados para exibir no gráfico.</div>;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const colors = ["#4f7cff", "#5dd6ff", "#2fd1a5", "#ff8aa6", "#a48bff", "#ffc46b"];
  let offset = 0;
  const gradient = data.map((item, index) => {
    const start = (offset / total) * 100;
    offset += item.value;
    const end = (offset / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(", ");

  return (
    <div className="donut-layout">
      <div className="donut-chart" style={{ background: `conic-gradient(${gradient})` }}><div className="donut-core"><span>Total</span><strong>{total}</strong></div></div>
      <div className="donut-legend">
        {data.map((item, index) => (
          <button type="button" className={`legend-row ${activeLabel === item.label ? "legend-row-active" : ""}`} key={item.label} onClick={() => onSliceClick?.(item.label)}>
            <span className="legend-dot" style={{ backgroundColor: colors[index % colors.length] }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
