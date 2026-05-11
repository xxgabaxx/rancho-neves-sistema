import React, { useId, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  Coins,
  Database,
  Gauge,
  Package,
  Printer,
  Plus,
  Route,
  Settings,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import seed from "./data/seed.json";
import { useRanchoStore } from "./store.js";
import {
  addDays,
  calcDashboard,
  calcReservationFolio,
  consumptionTotal,
  formatCurrency,
  formatDate,
  isoDate,
  nightsBetween,
  numberValue,
  parseDate,
  reservationOverlaps,
} from "./lib/calculations.js";
import { pullFromGoogleSheets, pushToGoogleSheets, syncStatusLabel } from "./lib/googleSheets.js";
import "./styles.css";

const tabs = [
  { id: "dashboard", label: "Painel", icon: Gauge },
  { id: "reservas", label: "Reservas", icon: CalendarDays },
  { id: "operacao", label: "Operação", icon: Settings },
  { id: "hospedes", label: "Hóspedes", icon: Users },
  { id: "cotacoes", label: "Cotações", icon: Coins },
  { id: "pagamentos", label: "Pagamentos", icon: WalletCards },
  { id: "tarefas", label: "Tarefas", icon: Settings },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
  { id: "estoque", label: "Estoque", icon: Package },
  { id: "tarifas", label: "Tarifas", icon: Coins },
  { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  { id: "cavalos", label: "Cavalos", icon: Route },
  { id: "cadastros", label: "Cadastros", icon: Settings },
  { id: "documentos", label: "Documentos", icon: Printer },
  { id: "backup", label: "Backup", icon: Database },
  { id: "drive", label: "Google Drive", icon: Database },
  { id: "usuarios", label: "Usuários", icon: Users },
];

const moduleLabels = {
  dashboard: "Painel",
  operacao: "Operação",
  reservas: "Reservas",
  hospedes: "Hóspedes",
  cotacoes: "Cotações",
  pagamentos: "Pagamentos",
  tarefas: "Tarefas",
  financeiro: "Financeiro",
  estoque: "Estoque",
  tarifas: "Tarifas",
  relatorios: "Relatórios",
  cavalos: "Cavalos",
  cadastros: "Cadastros",
  documentos: "Documentos",
  backup: "Backup",
  drive: "Google Drive",
  usuarios: "Usuários",
};
const permissionActions = ["ler", "adicionar", "editar", "apagar", "exportar", "sincronizar", "lancar", "admin"];
const permissionActionLabels = {
  ler: "Ler",
  adicionar: "Adicionar",
  editar: "Editar",
  apagar: "Apagar",
  exportar: "Exportar",
  sincronizar: "Sincronizar",
  lancar: "Lançar",
  admin: "Admin",
};
const collectionModules = {
  reservas: "reservas",
  receitasExtras: "financeiro",
  despesas: "financeiro",
  consumos: "estoque",
  cotacoes: "cotacoes",
  pagamentos: "pagamentos",
  tarefas: "tarefas",
  movCavalos: "cavalos",
  horses: "cavalos",
  ridingActivities: "cavalos",
  ridingReservations: "cavalos",
  horseHealthRecords: "cavalos",
  ingredients: "estoque",
  menuProducts: "estoque",
  recipeItems: "estoque",
  stockMovements: "estoque",
  suppliers: "estoque",
  purchaseInvoices: "estoque",
  purchaseInvoiceItems: "estoque",
  supplierProductMappings: "estoque",
  accountsPayable: "estoque",
  users: "usuarios",
  roles: "usuarios",
  rolePermissions: "usuarios",
  auditLogs: "usuarios",
};

const reservationStatusExtras = ["Reservado", "Hospedado", "Finalizada", "No-show", "Bloqueio"];
const cleaningStatusOptions = ["Pendente", "Em limpeza", "Pronta", "Manutenção"];
const paymentStatusOptions = ["Previsto", "Recebido", "Conciliado", "Estornado"];
const paymentTypeOptions = ["Sinal", "Parcela", "Restante check-in", "Restante check-out", "Consumo", "Ajuste"];
const checkinChecklist = [
  ["checkinDocumento", "Documento conferido"],
  ["checkinSaldo", "Saldo combinado"],
  ["checkinCabana", "Cabana pronta"],
  ["checkinEnxoval", "Enxoval conferido"],
];
const checkoutChecklist = [
  ["checkoutVistoria", "Vistoria feita"],
  ["checkoutConsumo", "Consumo conferido"],
  ["checkoutChaves", "Chaves devolvidas"],
  ["checkoutLimpeza", "Limpeza acionada"],
];

function reservationStatusOptions(data) {
  return [...new Set([...(data.listas.status ?? []), ...reservationStatusExtras])];
}

function App() {
    const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem("rks-authenticated") === "true");
    const [currentUser, setCurrentUser] = useState(() => sessionStorage.getItem("rks-user") || "");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [active, setActive] = useState(getInitialTab);

    const store = useRanchoStore(seed);
    const stats = useMemo(() => calcDashboard(store.data), [store.data]);

    const userAccount = getUserAccount(currentUser, store.data.users);

    const permissionSet = useMemo(
        () => buildPermissionSet(userAccount, store.data.rolePermissions),
        [userAccount, store.data.rolePermissions]
    );

    const can = (module, action = "ler") =>
        hasPermission(permissionSet, module, action);

    const visibleTabs = tabs.filter((tab) => can(tab.id, "ler"));

    const safeActive = can(active, "ler")
        ? active
        : (visibleTabs[0]?.id || "dashboard");

    const ActiveIcon =
        tabs.find((tab) => tab.id === safeActive)?.icon ?? Gauge;

    const audit = (action, collection, id, details = "") => {
        store.addAuditLog?.({
            userId: userAccount?.id || "",
            username: userAccount?.username || currentUser || "",
            action,
            module: collectionModules[collection] || collection,
            collection,
            recordId: id || "",
            details,
            createdAt: new Date().toISOString(),
        });
    };
  const ensurePermission = (collection, action) => {
    const module = collectionModules[collection] || collection;
    if (can(module, action)) return true;
    alert(`Sem permissão para ${permissionActionLabels[action] || action} em ${moduleLabels[module] || module}.`);
    return false;
  };
  const guardedUpdateItem = (collection, id, patch) => {
    if (!ensurePermission(collection, "editar")) return;
    audit("editar", collection, id, Object.keys(patch ?? {}).join(", "));
    store.updateItem(collection, id, patch);
  };
  const guardedRemoveItem = (collection, id) => {
    if (!ensurePermission(collection, "apagar")) return;
    audit("apagar", collection, id);
    store.removeItem(collection, id);
  };
  const guardedAdd = (collection, fn) => (payload) => {
    if (!ensurePermission(collection, "adicionar")) return;
    audit("adicionar", collection, payload?.id || "");
    fn(payload);
  };
  const guardedAddFinanceiro = (collection, payload) => {
    if (!ensurePermission(collection, "adicionar")) return;
    audit("adicionar", collection, payload?.id || "");
    store.addFinanceiro(collection, payload);
  };
  const guardedSyncNow = (data) => {
    if (!can("drive", "sincronizar")) {
      alert("Sem permissão para sincronizar com Google Drive.");
      return;
    }
    audit("sincronizar", "drive", "");
    return store.syncNow(data);
  };
  const guardedPullNow = () => {
    if (!can("drive", "sincronizar")) {
      alert("Sem permissão para puxar dados do Google Drive.");
      return;
    }
    audit("puxar_sheets", "drive", "");
    return store.pullNow();
  };
  const guardedImportData = (nextData) => {
    if (!can("backup", "admin")) {
      alert("Sem permissão administrativa para restaurar backup.");
      return;
    }
    audit("importar_backup", "backup", "");
    store.importData(nextData);
  };
  const guardedResetLocal = () => {
    if (!can("backup", "admin")) {
      alert("Sem permissão administrativa para restaurar a base local.");
      return;
    }
    audit("restaurar_base_local", "backup", "");
    store.resetLocalData();
  };

  useEffect(() => {
    const handleHashChange = () => setActive(getInitialTab());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (authenticated && active !== safeActive) {
      setActive(safeActive);
      window.location.hash = safeActive;
    }
  }, [authenticated, active, safeActive]);

  const changeTab = (tabId) => {
    if (!can(tabId, "ler")) {
      alert(`Sem permissão para acessar ${moduleLabels[tabId] || tabId}.`);
      return;
    }
    setActive(tabId);
    window.location.hash = tabId;
  };
  const lockSystem = () => {
    sessionStorage.removeItem("rks-authenticated");
    sessionStorage.removeItem("rks-user");
    setAuthenticated(false);
    setCurrentUser("");
  };

  if (!authenticated) {
    return <AuthGate users={store.data.users} onAuthenticated={(user) => { setAuthenticated(true); setCurrentUser(user); }} />;
  }

    return (
        <main className="appShell">

            <aside className={mobileMenuOpen ? "sidebar mobileOpen" : "sidebar"}>

                <button
                    className="mobileCloseButton"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    Fechar ✕
                </button>

                <div className="brand">
                    <img className="systemLogo" src="/brand/rks-hotelaria.png" alt="RKS Hotelaria" />
                    <span className="systemLabel">Sistema RKS Hotelaria</span>
                </div>

                <div className="clientBrand">
                    <img className="clientLogo" src="/brand/rancho-das-neves-logo.png" alt="Rancho das Neves" />
                    <div>
                        <strong>Rancho das Neves</strong>
                        <span>Cliente · Controle operacional</span>
                    </div>
                </div>

                <nav>
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;

                        return (
                            <button
                                className={safeActive === tab.id ? "navItem active" : "navItem"}
                                key={tab.id}
                                onClick={(event) => {
                                    event.preventDefault();
                                    setActive(tab.id);
                                    setMobileMenuOpen(false);
                                }}
                                title={tab.label}
                            >
                                <Icon size={18} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>
        <div className="sidebarFooter">
          <div className="userBadge">
            <span>Usuário</span>
            <strong>{currentUser || "admin"}</strong>
          </div>
          <span>{syncStatusLabel(store.syncStatus)}</span>
          {can("backup", "admin") && <button className="ghostButton" onClick={() => secureDangerAction("Restaurar base local?", guardedResetLocal)}>Restaurar base</button>}
          <button className="ghostButton" onClick={lockSystem}>Bloquear sistema</button>
        </div>
      </aside>

          <section className="workspace">
              <header className="topbar">

                  <button
                      className="mobileMenuButton"
                      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  >
                      ☰ Menu
                  </button>

                  <div>
                      <p className="eyebrow">Sistema web</p>
                      <h1>
                          <ActiveIcon size={26} />
                          {tabs.find((tab) => tab.id === safeActive)?.label}
                      </h1>
                  </div>

                    <div className="topActions">
                        <span>Fonte: planilha importada</span>

                        {can("reservas", "adicionar") && (
                            <button
                                className="primaryButton"
                                onClick={() => changeTab("reservas")}
                            >
                                <Plus size={17} /> Nova reserva
                            </button>
                        )}

                        <button
                            className="logoutButton"
                            onClick={lockSystem}
                        >
                            Sair
                        </button>
                    </div>

              </header>

        {!can(safeActive, "ler") && <AccessDenied module={safeActive} />}
        {safeActive === "dashboard" && <Dashboard stats={stats} data={store.data} />}
        {safeActive === "operacao" && <Operacao data={store.data} stats={stats} updateItem={guardedUpdateItem} />}
        {safeActive === "hospedes" && <Hospedes data={store.data} addGuestProfile={guardedAdd("guestProfiles", store.addGuestProfile)} updateItem={guardedUpdateItem} />}
        {safeActive === "cotacoes" && (
          <Cotacoes
            data={store.data}
            addCotacao={guardedAdd("cotacoes", store.addCotacao)}
            addReserva={guardedAdd("reservas", store.addReserva)}
            removeItem={guardedRemoveItem}
          />
        )}
        {safeActive === "pagamentos" && (
          <Pagamentos
            data={store.data}
            addPagamento={guardedAdd("pagamentos", store.addPagamento)}
            updateItem={guardedUpdateItem}
            removeItem={guardedRemoveItem}
            canAction={can}
          />
        )}
        {safeActive === "tarefas" && (
          <Tarefas
            data={store.data}
            addTarefa={guardedAdd("tarefas", store.addTarefa)}
            updateItem={guardedUpdateItem}
            removeItem={guardedRemoveItem}
          />
        )}
        {safeActive === "reservas" && (
          <Reservas
            data={store.data}
            addReserva={guardedAdd("reservas", store.addReserva)}
            removeItem={guardedRemoveItem}
            updateItem={guardedUpdateItem}
          />
        )}
        {safeActive === "financeiro" && <Financeiro data={store.data} addFinanceiro={guardedAddFinanceiro} removeItem={guardedRemoveItem} />}
        {safeActive === "estoque" && (
          <Estoque
            data={store.data}
            addConsumo={guardedAdd("consumos", store.addConsumo)}
            addIngredient={guardedAdd("ingredients", store.addIngredient)}
            addMenuProduct={guardedAdd("menuProducts", store.addMenuProduct)}
            addRecipeItem={guardedAdd("recipeItems", store.addRecipeItem)}
            addStockMovement={guardedAdd("stockMovements", store.addStockMovement)}
            addSupplier={guardedAdd("suppliers", store.addSupplier)}
            addPurchaseInvoice={guardedAdd("purchaseInvoices", store.addPurchaseInvoice)}
            addPurchaseInvoiceItem={guardedAdd("purchaseInvoiceItems", store.addPurchaseInvoiceItem)}
            addAccountPayable={guardedAdd("accountsPayable", store.addAccountPayable)}
            addSupplierProductMapping={guardedAdd("supplierProductMappings", store.addSupplierProductMapping)}
            addFinanceiro={guardedAddFinanceiro}
            updateItem={guardedUpdateItem}
            removeItem={guardedRemoveItem}
          />
        )}
        {safeActive === "tarifas" && <Tarifas data={store.data} />}
        {safeActive === "relatorios" && <Relatorios data={store.data} />}
        {safeActive === "cavalos" && (
          <Cavalos
            data={store.data}
            addCavalo={guardedAdd("movCavalos", store.addCavalo)}
            addHorse={guardedAdd("horses", store.addHorse)}
            addRidingActivity={guardedAdd("ridingActivities", store.addRidingActivity)}
            addRidingReservation={guardedAdd("ridingReservations", store.addRidingReservation)}
            addHorseHealthRecord={guardedAdd("horseHealthRecords", store.addHorseHealthRecord)}
            updateItem={guardedUpdateItem}
            removeItem={guardedRemoveItem}
          />
        )}
        {safeActive === "cadastros" && (
          <Cadastros
            data={store.data}
            addListValue={store.addListValue}
            addCardapioItem={store.addCardapioItem}
            addEstoqueItem={store.addEstoqueItem}
          />
        )}
        {safeActive === "documentos" && <Documentos data={store.data} />}
        {safeActive === "backup" && <Backup data={store.data} importData={guardedImportData} canExport={can("backup", "exportar")} canAdmin={can("backup", "admin")} />}
        {safeActive === "drive" && (
          <DriveConfig
            data={store.data}
            syncNow={guardedSyncNow}
            pullNow={guardedPullNow}
            syncStatus={store.syncStatus}
            syncMessage={store.syncMessage}
            canSync={can("drive", "sincronizar")}
          />
        )}
        {safeActive === "usuarios" && (
          <Usuarios
            data={store.data}
            addUser={guardedAdd("users", store.addUser)}
            addRole={guardedAdd("roles", store.addRole)}
            addRolePermission={guardedAdd("rolePermissions", store.addRolePermission)}
            updateItem={guardedUpdateItem}
            removeItem={guardedRemoveItem}
            currentUser={currentUser}
          />
        )}
      </section>
    </main>
  );
}

function AuthGate({ users = [], onAuthenticated }) {
    const [user, setUser] = useState(localStorage.getItem("rks-last-user") || import.meta.env.VITE_APP_ACCESS_USER || "");
    const [pin, setPin] = useState("");
    const [showPin, setShowPin] = useState(false);
    const [remember, setRemember] = useState(true);
    const [error, setError] = useState("");
    const [remoteUsers, setRemoteUsers] = useState(users);
    const [loadingUsers, setLoadingUsers] = useState(false);

    const expectedUser = import.meta.env.VITE_APP_ACCESS_USER;
    const expectedPin = import.meta.env.VITE_APP_ACCESS_PIN;

    useEffect(() => {
        async function loadUsers() {
            setLoadingUsers(true);

            try {
                const pulled = await pullFromGoogleSheets();

                if (pulled?.users?.length) {
                    setRemoteUsers(pulled.users);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoadingUsers(false);
            }
        }

        loadUsers();
    }, []);

    const submit = (event) => {
        event.preventDefault();

        const account = remoteUsers.find(
            (item) =>
                item.active !== false &&
                String(item.username ?? "").trim().toLowerCase() === user.trim().toLowerCase()
        );

        const fallbackAllowed =
            expectedUser &&
            expectedPin &&
            user.trim().toLowerCase() === expectedUser.toLowerCase() &&
            pin.trim() === expectedPin;

        if (!account && !fallbackAllowed) {
            setError("Usuário não autorizado.");
            setPin("");
            return;
        }

        if (account && pin.trim() !== String(account.pin ?? "")) {
            setError("PIN incorreto.");
            setPin("");
            return;
        }

        const authenticatedUser = account?.username || expectedUser;

        sessionStorage.setItem("rks-authenticated", "true");
        sessionStorage.setItem("rks-user", authenticatedUser);

        if (remember) {
            localStorage.setItem("rks-last-user", authenticatedUser);
        }

        onAuthenticated(authenticatedUser);
    };

    return (
        <main className="authShell">
            <div className="authBg">
                {authPhotos.map((photo, index) => (
                    <span key={photo} className="authSlide" style={{ backgroundImage: `url("${photo}")`, animationDelay: `${index * 5}s` }} />
                ))}
            </div>
            <div className="authOverlay" />
            <div className="authSnow" aria-hidden="true">
                {Array.from({ length: 26 }, (_, index) => (
                    <span key={index} style={{
                        left: `${(index * 37) % 100}%`,
                        animationDelay: `${-(index * 0.71).toFixed(2)}s`,
                        animationDuration: `${12 + (index % 8)}s`,
                    }} />
                ))}
            </div>

            <header className="authTopbar">
                <div className="authClientMark">
                    <BedDouble size={22} />
                    <div>
                        <strong>Rancho das Neves</strong>
                        <span>Rancho Queimado · SC</span>
                    </div>
                </div>
                <div className="authStatus"><i /> {loadingUsers ? "Sincronizando..." : "Sistema Online"}</div>
            </header>

            <section className="authMain">
                <form className="authCard" onSubmit={submit}>
                    <div className="authCardHeader">
                        <div className="authBrandRow">
                            <img className="authLogo" src="/brand/rks-hotelaria.png" alt="RKS Hotelaria" />
                        </div>
                        <img className="authClientLogo" src="/brand/rancho-das-neves-logo.png" alt="Rancho das Neves" />
                        <p className="eyebrow">Acesso protegido</p>
                        <h1>Bem-vindo de volta</h1>
                        <span>Painel de gestão · Rancho das Neves</span>
                    </div>

                    <div className="authDivider" />

                    <label className="authField" htmlFor="access-user">
                        <span>Usuário / E-mail</span>
                        <input
                            id="access-user"
                            type="text"
                            autoComplete="username"
                            placeholder="admin"
                            value={user}
                            onChange={(event) => setUser(event.target.value)}
                            autoFocus
                        />
                    </label>

                    <label className="authField" htmlFor="access-pin">
                        <span>PIN / Senha</span>
                        <div className="authPassword">
                            <input
                                id="access-pin"
                                type={showPin ? "text" : "password"}
                                inputMode="numeric"
                                autoComplete="current-password"
                                placeholder="••••••"
                                value={pin}
                                onChange={(event) => setPin(event.target.value)}
                            />
                            <button type="button" onClick={() => setShowPin((current) => !current)}>
                                {showPin ? "Ocultar" : "Ver"}
                            </button>
                        </div>
                    </label>

                    <div className="authOptions">
                        <label>
                            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                            <span>Manter usuário</span>
                        </label>
                        <button type="button" onClick={() => setError("Use o PIN cadastrado no sistema ou solicite ao administrador.")}>Esqueci o PIN</button>
                    </div>

                    {error && <div className="authNotice">{error}</div>}

                    <button className="authSubmit" type="submit" disabled={loadingUsers}>
                        {loadingUsers ? "Sincronizando usuários..." : "Entrar no sistema"}
                    </button>

                    <footer className="authFooter">
                        <span>RKS Hotelaria · v1.0</span>
                        <button type="button" onClick={() => setError("Suporte RKS: configuração local do sistema.")}>Precisa de ajuda?</button>
                    </footer>
                </form>
            </section>
        </main>
    );
}
const authPhotos = [
  "https://www.multitemporada.com/image/d235/6567790c6ed23617fcad57cd/chalet-do-lago-com-banheira-rancho-das-neves?&width=1900",
  "https://www.multitemporada.com/image/d235/65677f27716bdd629d720ae1/casa-rosalina-rancho-das-neves?&width=1900",
  "https://www.multitemporada.com/image/d235/6567790b59cfa5f66ab4401d/chalet-do-lago-com-banheira-rancho-das-neves?&width=1900",
];

function getUserAccount(username, users = []) {
  return users.find((item) => String(item.username ?? "").toLowerCase() === String(username ?? "").toLowerCase())
    ?? users.find((item) => item.id === "USR-ADMIN")
    ?? { id: "USR-FALLBACK", username: username || "admin", roleId: "ROLE-ADMIN", active: true };
}

function buildPermissionSet(user, rolePermissions = []) {
  if (!user || user.active === false) return new Set();
  return new Set(
    rolePermissions
      .filter((permission) => permission.roleId === user.roleId && permission.allowed !== false)
      .map((permission) => `${permission.module}:${permission.action}`),
  );
}

function hasPermission(permissionSet, module, action = "ler") {
  return permissionSet.has(`${module}:admin`)
    || permissionSet.has(`${module}:${action}`)
    || (action !== "ler" && permissionSet.has(`${module}:editar`) && action === "lancar");
}

function AccessDenied({ module }) {
  return (
    <Panel title="Acesso negado">
      <div className="alertBox">
        <strong>Permissão insuficiente</strong>
        <span>Seu usuário não possui acesso a {moduleLabels[module] || module}. Peça liberação para um administrador.</span>
      </div>
    </Panel>
  );
}

function secureDangerAction(message, action) {
  const pin = import.meta.env.VITE_APP_ACCESS_PIN;
  if (!window.confirm(message)) return;
  if (pin) {
    const typed = window.prompt("Digite o PIN para confirmar.");
    if (typed !== pin) return;
  }
  action();
}

function secureRemove(collection, id, removeItem, label = "item") {
  secureDangerAction(`Excluir ${label}?`, () => removeItem(collection, id));
}

function getInitialTab() {
  const hashTab = window.location.hash.replace("#", "");
  return tabs.some((tab) => tab.id === hashTab) ? hashTab : "dashboard";
}

function Dashboard({ stats, data }) {
  const executive = buildExecutiveDashboard(data, stats);
  const kpis = [
    ["Receita reservas", stats.receitaReservas],
    ["Receitas extras", stats.receitasExtras],
    ["Receita cavalos", stats.receitaCavalos],
    ["Venda consumo", stats.vendaConsumo],
    ["Despesas", stats.despesas],
    ["Resultado", stats.resultado],
  ];

  return (
    <div className="viewStack">
      <Panel title="Pulso executivo">
        <div className="operationHeader">
          <div>
            <p className="eyebrow">{formatDate(isoDate(new Date()))}</p>
            <h3>Rancho das Neves</h3>
            <span className="muted">Visão rápida para operação, caixa, compras e ocupação.</span>
          </div>
          <div className="operationStats">
            <MetricLine label="Ocupação hoje" value={`${executive.occupancyToday.toFixed(0)}%`} />
            <MetricLine label="Ocupação 7 dias" value={`${executive.occupancyNext7.toFixed(0)}%`} />
            <MetricLine label="Resultado mês" value={formatCurrency(executive.monthResult)} />
            <MetricLine label="Caixa em aberto" value={formatCurrency(executive.openCash)} />
          </div>
        </div>
      </Panel>
      <section className="kpiGrid">
        <article className="kpiCard"><span>Chegadas hoje</span><strong>{stats.chegadasHoje.length}</strong></article>
        <article className="kpiCard"><span>Saídas hoje</span><strong>{stats.saidasHoje.length}</strong></article>
        <article className="kpiCard"><span>Cabanas ocupadas</span><strong>{stats.ocupadasHoje.length}</strong></article>
        <article className="kpiCard"><span>Saldo hóspedes</span><strong className={stats.saldoHospedes > 0 ? "negative" : ""}>{formatCurrency(stats.saldoHospedes)}</strong></article>
        <article className="kpiCard"><span>Contas vencidas</span><strong className={executive.overduePayables > 0 ? "negative" : ""}>{executive.overduePayables}</strong></article>
        <article className="kpiCard"><span>Estoque crítico</span><strong className={executive.stockCriticalCount > 0 ? "negative" : ""}>{executive.stockCriticalCount}</strong></article>
      </section>
      <section className="contentGrid three">
        <Panel title="Próximos 7 dias">
          <MetricLine label="Chegadas" value={executive.next7Arrivals.length} />
          <MetricLine label="Saídas" value={executive.next7Departures.length} />
          <MetricLine label="Receita hospedagem" value={formatCurrency(executive.next7Revenue)} />
          <MetricLine label="Cabanas-noite" value={executive.next7RoomNights} />
        </Panel>
        <Panel title="Financeiro agora">
          <MetricLine label="Saldo hóspedes" value={formatCurrency(stats.saldoHospedes)} />
          <MetricLine label="Contas abertas notas" value={formatCurrency(executive.payableSummary.openTotal)} />
          <MetricLine label="Vence em 7 dias" value={executive.payableSummary.dueSoonCount} />
          <MetricLine label="Pago em notas" value={formatCurrency(executive.payableSummary.paidTotal)} />
        </Panel>
        <Panel title="Compras e estoque">
          <MetricLine label="Itens para comprar" value={executive.purchasePlan.rows.length} />
          <MetricLine label="Custo reposição" value={formatCurrency(executive.purchasePlan.estimatedTotal)} />
          <MetricLine label="Alertas cozinha" value={executive.kitchenAlerts.all.length} />
          <MetricLine label="Notas pendentes" value={executive.pendingInvoices} />
        </Panel>
      </section>
      <section className="contentGrid two">
        <Panel title="Agenda crítica">
          <Table
            columns={["Data", "Tipo", "Hóspede", "Cabana", "Status"]}
            rows={executive.agenda.map((item) => [
              formatDate(item.date),
              item.type,
              item.hospede,
              item.cabana,
              <span className={item.statusClass}>{item.status}</span>,
            ])}
            empty="Sem agenda crítica para os próximos dias."
          />
        </Panel>
        <Panel title="Alertas executivos">
          <div className="alertStack">
            {executive.alerts.length === 0 && <div className="okBox"><strong>Tudo certo</strong><span>Nenhum alerta executivo crítico agora.</span></div>}
            {executive.alerts.map((alert) => (
              <div className={alert.type === "danger" ? "alertBox" : "okBox"} key={alert.message}>
                <strong>{alert.title}</strong>
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
      <section className="kpiGrid">
        {kpis.map(([label, value]) => (
          <article className="kpiCard" key={label}>
            <span>{label}</span>
            <strong className={label === "Despesas" ? "negative" : value < 0 ? "negative" : ""}>{formatCurrency(value)}</strong>
          </article>
        ))}
      </section>
      <section className="contentGrid two">
        <Panel title="Reservas por cabana">
          <SimpleBars rows={stats.reservasPorCabana} valueKey="total" labelKey="cabana" />
        </Panel>
        <Panel title="Operação de hoje">
          <MetricLine label="Chegadas" value={stats.chegadasHoje.length} />
          <MetricLine label="Saídas" value={stats.saidasHoje.length} />
          <MetricLine label="Cabanas ocupadas" value={stats.ocupadasHoje.length} />
          <MetricLine label="Saldo aberto hóspedes" value={formatCurrency(stats.saldoHospedes)} />
        </Panel>
      </section>
      <section className="contentGrid two">
        <Panel title="Chegadas e saídas">
          <Table
            columns={["Tipo", "Hóspede", "Cabana", "Status"]}
            rows={[
              ...stats.chegadasHoje.map((item) => ["Chegada", item.hospede, item.cabana, <span className="status">{item.status || "Reservado"}</span>]),
              ...stats.saidasHoje.map((item) => ["Saída", item.hospede, item.cabana, <span className="status warn">{item.limpeza || "Limpeza pendente"}</span>]),
            ]}
            empty="Sem chegadas ou saídas para hoje."
          />
        </Panel>
        <Panel title="Alertas de estoque">
          <Table
            columns={["Produto", "Atual", "Mínimo", "Status"]}
            rows={stats.estoqueCritico.map((item) => [
              item.produto,
              item.atual,
              item.minimo,
              <span className="status danger">Crítico</span>,
            ])}
            empty="Nenhum item crítico cadastrado."
          />
        </Panel>
      </section>
      <Panel title="Contas em aberto">
        <Table
          columns={["Reserva", "Hóspede", "Cabana", "Total", "Pago", "Saldo"]}
          rows={data.reservas
            .map((reserva) => ({ reserva, folio: calcReservationFolio(reserva, data.consumos, data.pagamentos) }))
            .filter(({ folio }) => folio.saldo > 0)
            .map(({ reserva, folio }) => [
              reserva.id,
              reserva.hospede,
              reserva.cabana,
              formatCurrency(folio.total),
              formatCurrency(folio.pago),
              <strong className="negative">{formatCurrency(folio.saldo)}</strong>,
            ])}
          empty="Nenhuma conta em aberto."
        />
      </Panel>
      <section className="contentGrid three">
        <Panel title="Base importada">
          <MetricLine label="Cabanas" value={data.listas.cabanas_full?.length ?? data.listas.cabanas?.length ?? 0} />
          <MetricLine label="Produtos/cardápio" value={data.cardapio.length} />
          <MetricLine label="OTAs/canais" value={data.otas.length} />
        </Panel>
        <Panel title="Repasses MT">
          <MetricLine label="Recebido" value={formatCurrency(stats.recebidoMt)} />
          <MetricLine label="Diferença" value={formatCurrency(stats.diferencaRepasse)} />
          <MetricLine label="Pendências" value={stats.repassesPendentes} />
        </Panel>
        <Panel title="Movimento">
          <MetricLine label="Reservas" value={data.reservas.length} />
          <MetricLine label="Lançamentos financeiros" value={data.receitasExtras.length + data.despesas.length} />
          <MetricLine label="Consumos" value={data.consumos.length} />
        </Panel>
      </section>
    </div>
  );
}

function buildExecutiveDashboard(data, stats) {
  const todayIso = isoDate(new Date());
  const today = parseDate(todayIso);
  const next7End = addDays(today, 7);
  const cabanaCount = Math.max(1, data.listas.cabanas_full?.length ?? data.listas.cabanas?.length ?? 1);
  const activeReservations = data.reservas.filter((reserva) => !["Cancelado", "No-show", "Bloqueio"].includes(reserva.status));
  const overlapsDay = (reserva, day) => {
    const checkIn = parseDate(reserva.checkIn);
    const checkOut = parseDate(reserva.checkOut);
    return !Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime()) && checkIn <= day && day < checkOut;
  };
  const next7Arrivals = activeReservations.filter((reserva) => {
    const date = parseDate(reserva.checkIn);
    return today <= date && date < next7End;
  });
  const next7Departures = activeReservations.filter((reserva) => {
    const date = parseDate(reserva.checkOut);
    return today <= date && date < next7End;
  });
  const next7Reservations = activeReservations.filter((reserva) => {
    const checkIn = parseDate(reserva.checkIn);
    const checkOut = parseDate(reserva.checkOut);
    return checkIn < next7End && today < checkOut;
  });
  const next7RoomNights = next7Reservations.reduce((total, reserva) => total + nightsInsideRange(reserva.checkIn, reserva.checkOut, today, next7End), 0);
  const monthReport = buildMonthlyReport(data, todayIso.slice(0, 7));
  const payableSummary = buildAccountsPayableSummary(data.accountsPayable ?? []);
  const purchasePlan = buildPurchasePlan(data.ingredients ?? [], data.purchaseInvoiceItems ?? [], data.purchaseInvoices ?? []);
  const kitchenAlerts = buildKitchenAlerts(data.ingredients ?? [], data.menuProducts ?? [], data.recipeItems ?? []);
  const stockCriticalCount = (data.ingredients ?? []).filter((item) => numberValue(item.minimumStock) > 0 && numberValue(item.currentStock) <= numberValue(item.minimumStock)).length + (stats.estoqueCritico?.length ?? 0);
  const agenda = [
    ...next7Arrivals.map((reserva) => ({
      date: reserva.checkIn,
      type: "Chegada",
      hospede: reserva.hospede,
      cabana: reserva.cabana,
      status: calcReservationFolio(reserva, data.consumos, data.pagamentos).saldo > 0 ? "Saldo aberto" : (reserva.limpeza === "Pronta" ? "Pronta" : "Preparar"),
      statusClass: calcReservationFolio(reserva, data.consumos, data.pagamentos).saldo > 0 ? "status warn" : (reserva.limpeza === "Pronta" ? "status" : "status warn"),
    })),
    ...next7Departures.map((reserva) => ({
      date: reserva.checkOut,
      type: "Saída",
      hospede: reserva.hospede,
      cabana: reserva.cabana,
      status: reserva.limpeza || "Limpeza",
      statusClass: "status neutral",
    })),
  ].sort((a, b) => parseDate(a.date) - parseDate(b.date)).slice(0, 12);
  const alerts = [
    ...(payableSummary.overdueCount ? [{ type: "danger", title: "Contas vencidas", message: `${payableSummary.overdueCount} parcela(s) de notas estão vencidas.` }] : []),
    ...(stats.saldoHospedes > 0 ? [{ type: "warn", title: "Saldo de hóspedes", message: `${formatCurrency(stats.saldoHospedes)} em aberto nas reservas.` }] : []),
    ...(purchasePlan.rows.length ? [{ type: "warn", title: "Reposição de estoque", message: `${purchasePlan.rows.length} item(ns) abaixo do mínimo. Custo estimado: ${formatCurrency(purchasePlan.estimatedTotal)}.` }] : []),
    ...(kitchenAlerts.highCmv.length ? [{ type: "warn", title: "CMV alto", message: `${kitchenAlerts.highCmv.length} produto(s) do cardápio precisam revisão de preço/ficha.` }] : []),
    ...(activeReservations.filter((reserva) => overlapsDay(reserva, today) && reserva.limpeza === "Manutenção").length ? [{ type: "danger", title: "Manutenção", message: "Há cabana ocupada/ativa marcada em manutenção hoje." }] : []),
  ];
  return {
    occupancyToday: (stats.ocupadasHoje.length / cabanaCount) * 100,
    occupancyNext7: (next7RoomNights / (cabanaCount * 7)) * 100,
    monthResult: monthReport.resultado,
    openCash: stats.saldoHospedes + payableSummary.openTotal,
    next7Arrivals,
    next7Departures,
    next7RoomNights,
    next7Revenue: next7Reservations.reduce((total, reserva) => total + numberValue(reserva.valorBruto), 0),
    payableSummary,
    overduePayables: payableSummary.overdueCount,
    purchasePlan,
    kitchenAlerts,
    stockCriticalCount,
    pendingInvoices: (data.purchaseInvoices ?? []).filter((invoice) => !["lançada", "cancelada"].includes(invoice.status)).length,
    agenda,
    alerts,
  };
}

function Operacao({ data, stats, updateItem }) {
  const [targetDate, setTargetDate] = useState(isoDate(new Date()));
  const reservasDoDia = data.reservas.filter((reserva) => {
    const current = parseDate(targetDate);
    const checkIn = parseDate(reserva.checkIn);
    const checkOut = parseDate(reserva.checkOut);
    return reserva.status !== "Cancelado" && checkIn <= current && current <= checkOut;
  });
  const chegadas = data.reservas.filter((reserva) => isoDate(parseDate(reserva.checkIn)) === targetDate);
  const saidas = data.reservas.filter((reserva) => isoDate(parseDate(reserva.checkOut)) === targetDate);
  const hospedados = data.reservas.filter((reserva) => {
    const current = parseDate(targetDate);
    const checkIn = parseDate(reserva.checkIn);
    const checkOut = parseDate(reserva.checkOut);
    return reserva.status === "Hospedado" || (reserva.status !== "Cancelado" && checkIn < current && current < checkOut);
  });
  const limpezaPendente = data.reservas.filter((reserva) => ["Pendente", "Em limpeza", "Manutenção"].includes(reserva.limpeza || "Pendente"));
  const checklistRows = uniqueById([...chegadas, ...saidas, ...hospedados]).filter((reserva) => reserva.status !== "Bloqueio");
  const chegadasComSaldo = chegadas.filter((reserva) => calcReservationFolio(reserva, data.consumos, data.pagamentos).saldo > 0);
  const documentosPendentes = chegadas.filter((reserva) => !reserva.checkinDocumento);
  const cabanasNaoProntas = chegadas.filter((reserva) => reserva.limpeza !== "Pronta");

  return (
    <div className="viewStack">
      <Panel title="Controle do dia">
        <div className="operationHeader">
          <Input label="Data operacional" type="date" value={targetDate} onChange={setTargetDate} />
          <div className="operationStats">
            <MetricLine label="Chegadas" value={chegadas.length} />
            <MetricLine label="Saídas" value={saidas.length} />
            <MetricLine label="Hospedados" value={hospedados.length} />
            <MetricLine label="Limpezas pendentes" value={limpezaPendente.length} />
          </div>
        </div>
      </Panel>

      <section className="contentGrid three">
        <Panel title="Alertas de entrada">
          <MetricLine label="Chegadas com saldo" value={chegadasComSaldo.length} />
          <MetricLine label="Documento pendente" value={documentosPendentes.length} />
          <MetricLine label="Cabana não pronta" value={cabanasNaoProntas.length} />
        </Panel>
        <Panel title="Pendências financeiras">
          <Table
            columns={["Reserva", "Hóspede", "Saldo"]}
            rows={chegadasComSaldo.map((reserva) => {
              const folio = calcReservationFolio(reserva, data.consumos, data.pagamentos);
              return [reserva.id, reserva.hospede, <strong className="negative">{formatCurrency(folio.saldo)}</strong>];
            })}
            empty="Nenhum saldo aberto nas chegadas."
          />
        </Panel>
        <Panel title="Preparação de cabana">
          <Table
            columns={["Cabana", "Reserva", "Limpeza"]}
            rows={cabanasNaoProntas.map((reserva) => [
              reserva.cabana,
              reserva.id,
              <span className="status warn">{reserva.limpeza || "Pendente"}</span>,
            ])}
            empty="Todas as chegadas estão prontas."
          />
        </Panel>
      </section>

      <section className="contentGrid two">
        <Panel title="Chegadas">
          <OperationTable
            rows={chegadas}
            data={data}
            empty="Nenhuma chegada nesta data."
            actions={(reserva) => (
              <>
                <button className="smallButton" onClick={() => updateItem("reservas", reserva.id, { status: "Hospedado" })}>Check-in</button>
                <button className="smallButton mutedButton" onClick={() => updateItem("reservas", reserva.id, { limpeza: "Pronta" })}>Cabana pronta</button>
              </>
            )}
          />
        </Panel>
        <Panel title="Saídas">
          <OperationTable
            rows={saidas}
            data={data}
            empty="Nenhuma saída nesta data."
            actions={(reserva) => (
              <>
                <button className="smallButton" onClick={() => updateItem("reservas", reserva.id, { status: "Finalizada", limpeza: "Pendente" })}>Check-out</button>
                <button className="smallButton mutedButton" onClick={() => updateItem("reservas", reserva.id, { limpeza: "Em limpeza" })}>Iniciar limpeza</button>
              </>
            )}
          />
        </Panel>
      </section>

      <section className="contentGrid two">
        <Panel title="Hospedados">
          <OperationTable
            rows={hospedados}
            data={data}
            empty="Nenhum hóspede hospedado nesta data."
            actions={(reserva) => (
              <>
                <button className="smallButton" onClick={() => updateItem("reservas", reserva.id, { status: "Finalizada", limpeza: "Pendente" })}>Finalizar</button>
                <button className="smallButton mutedButton" onClick={() => updateItem("reservas", reserva.id, { status: "Hospedado" })}>Hospedado</button>
              </>
            )}
          />
        </Panel>
        <Panel title="Governança e manutenção">
          <Table
            columns={["Cabana", "Reserva", "Hóspede", "Limpeza", "Ações"]}
            rows={limpezaPendente.map((reserva) => [
              reserva.cabana,
              reserva.id,
              reserva.hospede,
              <span className={reserva.limpeza === "Manutenção" ? "status danger" : "status warn"}>{reserva.limpeza || "Pendente"}</span>,
              <div className="rowActions">
                <button className="smallButton" onClick={() => updateItem("reservas", reserva.id, { limpeza: "Pronta" })}>Pronta</button>
                <button className="smallButton mutedButton" onClick={() => updateItem("reservas", reserva.id, { limpeza: "Manutenção" })}>Manutenção</button>
              </div>,
            ])}
            empty="Nenhuma pendência de limpeza."
          />
        </Panel>
      </section>

      <Panel title="Todas as reservas da data">
        <OperationTable rows={reservasDoDia} data={data} empty="Nenhuma reserva relacionada a esta data." />
      </Panel>

      <Panel title="Checklist operacional">
        <div className="checklistGrid">
          {checklistRows.length === 0 ? (
            <p className="muted">Nenhuma reserva para checklist nesta data.</p>
          ) : checklistRows.map((reserva) => (
            <OperationChecklist
              key={reserva.id}
              reserva={reserva}
              folio={calcReservationFolio(reserva, data.consumos, data.pagamentos)}
              updateItem={updateItem}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function OperationTable({ rows, data, empty, actions }) {
  return (
    <Table
      columns={["Reserva", "Hóspede", "Cabana", "Período", "Status", "Limpeza", "Saldo", "Ações"]}
      rows={rows.map((reserva) => {
        const folio = calcReservationFolio(reserva, data.consumos, data.pagamentos);
        const checklist = checklistProgress(reserva);
        return [
          reserva.id,
          reserva.hospede,
          reserva.cabana,
          `${formatDate(reserva.checkIn)} a ${formatDate(reserva.checkOut)}`,
          <span className="status">{reserva.status || "Reservado"}</span>,
          <span className={reserva.limpeza === "Pronta" ? "status" : "status warn"}>{reserva.limpeza || "Pendente"}</span>,
          <strong className={folio.saldo > 0 ? "negative" : ""}>{formatCurrency(folio.saldo)}</strong>,
          <div className="rowActions">
            <span className={checklist.done === checklist.total ? "status" : "status warn"}>{checklist.done}/{checklist.total}</span>
            {actions ? actions(reserva) : null}
          </div>,
        ];
      })}
      empty={empty}
    />
  );
}

function OperationChecklist({ reserva, folio, updateItem }) {
  const saldoOk = folio.saldo <= 0 || reserva.checkinSaldo;
  const setFlag = (field, checked) => updateItem("reservas", reserva.id, { [field]: checked });
  return (
    <article className="checklistCard">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">{reserva.id}</p>
          <h3>{reserva.hospede || "Sem hóspede"}</h3>
          <span>{reserva.cabana} · saldo {formatCurrency(folio.saldo)}</span>
        </div>
        <span className={saldoOk ? "status" : "status danger"}>{saldoOk ? "Ok" : "Saldo aberto"}</span>
      </div>
      <div className="checklistColumns">
        <div>
          <strong>Entrada</strong>
          {checkinChecklist.map(([field, label]) => (
            <Checkbox key={field} label={label} checked={Boolean(reserva[field])} onChange={(checked) => setFlag(field, checked)} />
          ))}
          <Input label="Obs. entrada" value={reserva.obsEntrada} onChange={(obsEntrada) => updateItem("reservas", reserva.id, { obsEntrada })} />
        </div>
        <div>
          <strong>Saída</strong>
          {checkoutChecklist.map(([field, label]) => (
            <Checkbox key={field} label={label} checked={Boolean(reserva[field])} onChange={(checked) => setFlag(field, checked)} />
          ))}
          <Input label="Obs. saída" value={reserva.obsSaida} onChange={(obsSaida) => updateItem("reservas", reserva.id, { obsSaida })} />
        </div>
      </div>
      <div className="rowActions">
        <button className="smallButton" onClick={() => updateItem("reservas", reserva.id, {
          checkinDocumento: true,
          checkinSaldo: true,
          checkinCabana: true,
          checkinEnxoval: true,
          status: "Hospedado",
        })}>Concluir check-in</button>
        <button className="smallButton mutedButton" onClick={() => updateItem("reservas", reserva.id, {
          checkoutVistoria: true,
          checkoutConsumo: true,
          checkoutChaves: true,
          checkoutLimpeza: true,
          status: "Finalizada",
          limpeza: "Pendente",
        })}>Concluir check-out</button>
      </div>
    </article>
  );
}

function checklistProgress(reserva) {
  const fields = [...checkinChecklist, ...checkoutChecklist].map(([field]) => field);
  return {
    done: fields.filter((field) => Boolean(reserva[field])).length,
    total: fields.length,
  };
}

function uniqueById(rows) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function Hospedes({ data, addGuestProfile, updateItem }) {
  const profiles = useMemo(() => buildGuestProfiles(data), [data]);
  const [selectedKey, setSelectedKey] = useState("");
  const selected = profiles.find((profile) => profile.key === selectedKey) ?? profiles[0];
  const [messageKind, setMessageKind] = useState("confirmacao");
  const message = selected ? buildGuestMessage(selected, messageKind) : "";
  const updateGuestCrm = (patch) => {
    if (!selected) return;
    if (data.guestProfiles?.some((profile) => profile.id === selected.crmId)) {
      updateItem("guestProfiles", selected.crmId, patch);
      return;
    }
    addGuestProfile({
      id: selected.crmId,
      key: selected.key,
      nome: selected.nome,
      telefone: selected.telefone,
      email: selected.email,
      documento: selected.documento,
      ...patch,
    });
  };
  const toggleGuestTag = (tag) => {
    const tags = selected?.tags ?? [];
    updateGuestCrm({ tags: tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag] });
  };

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard">
          <span>Hóspedes únicos</span>
          <strong>{profiles.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Receita hospedagem</span>
          <strong>{formatCurrency(profiles.reduce((total, item) => total + item.totalHospedagem, 0))}</strong>
        </article>
        <article className="kpiCard">
          <span>Consumo vinculado</span>
          <strong>{formatCurrency(profiles.reduce((total, item) => total + item.totalConsumo, 0))}</strong>
        </article>
        <article className="kpiCard">
          <span>Saldo aberto</span>
          <strong className="negative">{formatCurrency(profiles.reduce((total, item) => total + Math.max(0, item.saldo), 0))}</strong>
        </article>
        <article className="kpiCard">
          <span>Reservas</span>
          <strong>{profiles.reduce((total, item) => total + item.reservas.length, 0)}</strong>
        </article>
        <article className="kpiCard">
          <span>Recorrentes</span>
          <strong>{profiles.filter((item) => item.reservas.length > 1).length}</strong>
        </article>
        <article className="kpiCard">
          <span>VIP / atenção</span>
          <strong>{profiles.filter((item) => item.tags.includes("VIP") || item.tags.includes("Atenção")).length}</strong>
        </article>
      </section>

      <section className="contentGrid two">
        <Panel title="Cadastro de hóspedes">
          <Table
            columns={["Hóspede", "Contato", "Tags", "Reservas", "Última estadia", "Total", "Saldo"]}
            rows={profiles.map((profile) => [
              <button className="linkButton" onClick={() => setSelectedKey(profile.key)}>{profile.nome}</button>,
              <div className="cellStack"><span>{profile.telefone || "-"}</span><span>{profile.email || ""}</span></div>,
              profile.tags.length ? profile.tags.join(", ") : "-",
              profile.reservas.length,
              profile.lastStay ? formatDate(profile.lastStay) : "-",
              formatCurrency(profile.total),
              <strong className={profile.saldo > 0 ? "negative" : ""}>{formatCurrency(profile.saldo)}</strong>,
            ])}
            empty="Nenhum hóspede cadastrado ainda."
          />
        </Panel>
        <Panel title="Perfil selecionado">
          {selected ? (
            <div className="guestProfile">
              <div>
                <p className="eyebrow">Hóspede</p>
                <h3>{selected.nome}</h3>
                <span>{selected.telefone || "Sem telefone"}</span>
              </div>
              <MetricLine label="E-mail" value={selected.email || "-"} />
              <MetricLine label="Documento" value={selected.documento || "-"} />
              <MetricLine label="Reservas" value={selected.reservas.length} />
              <MetricLine label="Hospedagem" value={formatCurrency(selected.totalHospedagem)} />
              <MetricLine label="Consumo" value={formatCurrency(selected.totalConsumo)} />
              <MetricLine label="Pago" value={formatCurrency(selected.pago)} />
              <MetricLine label="Saldo" value={formatCurrency(selected.saldo)} />
              <MetricLine label="Cabana favorita" value={selected.favoriteCabin || "-"} />
              <MetricLine label="Canal principal" value={selected.mainChannel || "-"} />
              <div className="tagRow">
                {["VIP", "Retorna sempre", "Com pet", "Família", "Atenção"].map((tag) => (
                  <button key={tag} className={selected.tags.includes(tag) ? "tagButton active" : "tagButton"} type="button" onClick={() => toggleGuestTag(tag)}>{tag}</button>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">Nenhum hóspede selecionado.</p>
          )}
        </Panel>
      </section>

      <section className="contentGrid two">
        <Panel title="Histórico do hóspede">
          <Table
            columns={["Reserva", "Cabana", "Período", "Canal", "Total", "Saldo"]}
            rows={(selected?.reservas ?? []).map(({ reserva, folio }) => [
              reserva.id,
              reserva.cabana,
              `${formatDate(reserva.checkIn)} a ${formatDate(reserva.checkOut)}`,
              reserva.canal,
              formatCurrency(folio.total),
              <strong className={folio.saldo > 0 ? "negative" : ""}>{formatCurrency(folio.saldo)}</strong>,
            ])}
            empty="Sem histórico."
          />
        </Panel>
        <Panel title="Mensagens prontas">
          <div className="messageTools">
            <div className="segmented">
              <button className={messageKind === "confirmacao" ? "active" : ""} onClick={() => setMessageKind("confirmacao")}>Confirmação</button>
              <button className={messageKind === "precheckin" ? "active" : ""} onClick={() => setMessageKind("precheckin")}>Pré check-in</button>
              <button className={messageKind === "saldo" ? "active" : ""} onClick={() => setMessageKind("saldo")}>Saldo</button>
            </div>
            <textarea className="messageBox" value={message} readOnly />
          </div>
        </Panel>
      </section>
      <section className="contentGrid two">
        <Panel title="Preferências e relacionamento">
          {selected ? (
            <div className="formGrid">
              <Input label="Preferências" value={selected.preferences} onChange={(preferences) => updateGuestCrm({ preferences })} />
              <Input label="Restrições / alergias" value={selected.restrictions} onChange={(restrictions) => updateGuestCrm({ restrictions })} />
              <Input label="Observações internas" value={selected.internalNotes} onChange={(internalNotes) => updateGuestCrm({ internalNotes })} />
              <Input label="Aniversário" type="date" value={selected.birthDate} onChange={(birthDate) => updateGuestCrm({ birthDate })} />
            </div>
          ) : <p className="muted">Selecione um hóspede.</p>}
        </Panel>
        <Panel title="Ranking de relacionamento">
          <Table
            columns={["Hóspede", "Reservas", "Total", "Tags"]}
            rows={profiles.slice(0, 8).map((profile) => [
              profile.nome,
              profile.reservas.length,
              formatCurrency(profile.total),
              profile.tags.join(", ") || "-",
            ])}
            empty="Sem dados de ranking."
          />
        </Panel>
      </section>
    </div>
  );
}

function buildGuestProfiles(data) {
  const profiles = new Map();
  const savedProfiles = new Map((data.guestProfiles ?? []).map((profile) => [profile.key, profile]));
  data.reservas.forEach((reserva) => {
    const nome = reserva.hospede || "Sem nome";
    const key = `${nome.toLowerCase()}|${reserva.telefone || ""}`;
    const folio = calcReservationFolio(reserva, data.consumos, data.pagamentos);
    const current = profiles.get(key) ?? {
      key,
      crmId: `GST-${btoa(unescape(encodeURIComponent(key))).replace(/[^A-Za-z0-9]/g, "").slice(0, 18)}`,
      nome,
      telefone: reserva.telefone || "",
      email: reserva.email || "",
      documento: reserva.documento || "",
      reservas: [],
      totalHospedagem: 0,
      totalConsumo: 0,
      total: 0,
      pago: 0,
      saldo: 0,
      lastStay: "",
      favoriteCabin: "",
      mainChannel: "",
      tags: [],
      preferences: "",
      restrictions: "",
      internalNotes: "",
      birthDate: "",
    };
    current.reservas.push({ reserva, folio });
    current.email ||= reserva.email || "";
    current.documento ||= reserva.documento || "";
    current.totalHospedagem += folio.hospedagem;
    current.totalConsumo += folio.consumo;
    current.total += folio.total;
    current.pago += folio.pago;
    current.saldo += folio.saldo;
    if (!current.lastStay || parseDate(reserva.checkOut) > parseDate(current.lastStay)) {
      current.lastStay = reserva.checkOut;
    }
    profiles.set(key, current);
  });
  return [...profiles.values()].map((profile) => {
    const saved = savedProfiles.get(profile.key) ?? {};
    const cabinCounts = countBy(profile.reservas.map(({ reserva }) => reserva.cabana).filter(Boolean));
    const channelCounts = countBy(profile.reservas.map(({ reserva }) => reserva.canal).filter(Boolean));
    return {
      ...profile,
      crmId: saved.id || saved.crmId || profile.crmId,
      tags: normalizeTags(saved.tags),
      preferences: saved.preferences || "",
      restrictions: saved.restrictions || "",
      internalNotes: saved.internalNotes || "",
      birthDate: saved.birthDate || "",
      favoriteCabin: saved.favoriteCabin || topCount(cabinCounts),
      mainChannel: saved.mainChannel || topCount(channelCounts),
    };
  }).sort((a, b) => b.total - a.total);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return String(tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function countBy(values = []) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function topCount(counts = {}) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function buildGuestMessage(profile, kind) {
  const latest = profile.reservas
    .slice()
    .sort((a, b) => parseDate(b.reserva.checkIn) - parseDate(a.reserva.checkIn))[0];
  if (!latest) return "";
  const { reserva, folio } = latest;
  if (kind === "precheckin") {
    return `Olá, ${profile.nome}! Passando para lembrar sua hospedagem no Rancho das Neves.\n\nCabana: ${reserva.cabana}\nCheck-in: ${formatDate(reserva.checkIn)}\nCheck-out: ${formatDate(reserva.checkOut)}\nHóspedes: ${numberValue(reserva.adultos) + numberValue(reserva.criancas)}\n\nEstamos à disposição.`;
  }
  if (kind === "saldo") {
    return `Olá, ${profile.nome}! Segue o resumo da sua conta no Rancho das Neves:\n\nHospedagem: ${formatCurrency(folio.hospedagem)}\nConsumo: ${formatCurrency(folio.consumo)}\nTotal: ${formatCurrency(folio.total)}\nPago: ${formatCurrency(folio.pago)}\nSaldo: ${formatCurrency(folio.saldo)}\n\nQualquer dúvida, estamos à disposição.`;
  }
  return `Olá, ${profile.nome}! Sua reserva no Rancho das Neves está confirmada.\n\nReserva: ${reserva.id}\nCabana: ${reserva.cabana}\nPeríodo: ${formatDate(reserva.checkIn)} a ${formatDate(reserva.checkOut)}\nNoites: ${nightsBetween(reserva.checkIn, reserva.checkOut)}\nValor total: ${formatCurrency(folio.total)}\nValor pago: ${formatCurrency(folio.pago)}\nSaldo: ${formatCurrency(folio.saldo)}\n\nObrigado pela preferência.`;
}

function Cotacoes({ data, addCotacao, addReserva, removeItem }) {
  const defaultPeriod = data.tarifasBase.find((item) => item.Período)?.Período ?? "";
  const [form, setForm] = useState({
    periodo: defaultPeriod,
    tipo: "Seg-Sex e Dom",
    noites: 2,
    adultos: 2,
    criancas: 0,
    pets: 0,
  });
  const quote = useMemo(() => calcQuote(data, form), [data, form]);
  const submit = (event) => {
    event.preventDefault();
    addCotacao({
      ...form,
      totalBruto: quote.totalBruto,
      valorSugerido: quote.valorSugerido,
      comissao: quote.comissao,
      liquidoEstimado: quote.liquidoEstimado,
      mensagem: buildQuoteMessage(form, quote),
    });
  };

  return (
    <div className="viewStack">
      <FormPanel title="Nova cotação" onSubmit={submit}>
        <Input label="Cliente" value={form.cliente} onChange={(cliente) => setForm({ ...form, cliente })} />
        <Input label="Telefone" value={form.telefone} onChange={(telefone) => setForm({ ...form, telefone })} />
        <Select label="Cabana" value={form.cabana} options={data.listas.cabanas_full ?? data.listas.cabanas} onChange={(cabana) => setForm({ ...form, cabana })} />
        <Select label="Período" value={form.periodo} options={[...new Set(data.tarifasBase.map((item) => item.Período).filter(Boolean))]} onChange={(periodo) => setForm({ ...form, periodo })} />
        <Select label="Tipo" value={form.tipo} options={["Seg-Sex e Dom", "Sábado", "Pacote"]} onChange={(tipo) => setForm({ ...form, tipo })} />
        <Input label="Check-in previsto" type="date" value={form.checkIn} onChange={(checkIn) => setForm({ ...form, checkIn })} />
        <Input label="Noites" type="number" value={form.noites} onChange={(noites) => setForm({ ...form, noites })} />
        <Input label="Adultos" type="number" value={form.adultos} onChange={(adultos) => setForm({ ...form, adultos })} />
        <Input label="Crianças" type="number" value={form.criancas} onChange={(criancas) => setForm({ ...form, criancas })} />
        <Input label="Pets" type="number" value={form.pets} onChange={(pets) => setForm({ ...form, pets })} />
        <Select label="Canal / OTA" value={form.canal} options={data.listas.canais_ota} onChange={(canal) => setForm({ ...form, canal })} />
        <Input label="Desconto" type="number" value={form.desconto} onChange={(desconto) => setForm({ ...form, desconto })} />
      </FormPanel>

      <section className="contentGrid three">
        <Panel title="Valor sugerido">
          <MetricLine label="Diária base" value={formatCurrency(quote.diariaBase)} />
          <MetricLine label="Ajuste cabana" value={`${Math.round(quote.ajusteUnidade * 100)}%`} />
          <MetricLine label="Valor sugerido" value={formatCurrency(quote.valorSugerido)} />
        </Panel>
        <Panel title="Composição">
          <MetricLine label="Hospedagem" value={formatCurrency(quote.hospedagem)} />
          <MetricLine label="Pessoa extra" value={formatCurrency(quote.pessoaExtra)} />
          <MetricLine label="Pet" value={formatCurrency(quote.pet)} />
        </Panel>
        <Panel title="Canal">
          <MetricLine label="Total bruto" value={formatCurrency(quote.totalBruto)} />
          <MetricLine label="Comissão estimada" value={formatCurrency(quote.comissao)} />
          <MetricLine label="Líquido estimado" value={formatCurrency(quote.liquidoEstimado)} />
        </Panel>
      </section>

      <section className="contentGrid two">
        <Panel title="Mensagem da proposta">
          <textarea className="messageBox" value={buildQuoteMessage(form, quote)} readOnly />
        </Panel>
        <Panel title="Cotações salvas">
          <Table
            columns={["Cliente", "Cabana", "Entrada", "Noites", "Canal", "Valor", "Status", "Ações"]}
            rows={(data.cotacoes ?? []).map((cotacao) => {
              const reserva = reservationFromQuote(cotacao);
              const hasConflict = data.reservas.some((item) => reservationOverlaps(item, reserva));
              return [
                cotacao.cliente || "-",
                cotacao.cabana || "-",
                cotacao.checkIn ? formatDate(cotacao.checkIn) : "-",
                cotacao.noites,
                cotacao.canal || "-",
                formatCurrency(cotacao.valorSugerido),
                hasConflict ? <span className="status danger">Conflito</span> : <span className="status">Livre</span>,
                <div className="rowActions">
                  <button className="smallButton" disabled={hasConflict || !cotacao.checkIn || !cotacao.cabana} onClick={() => addReserva(reserva)}>Criar reserva</button>
                  <IconButton title="Excluir" onClick={() => secureRemove("cotacoes", cotacao.id, removeItem, `cotação de ${cotacao.cliente || "cliente"}`)} icon={Trash2} />
                </div>,
              ];
            })}
            empty="Nenhuma cotação salva."
          />
        </Panel>
      </section>
    </div>
  );
}

function reservationFromQuote(cotacao) {
  const checkIn = cotacao.checkIn || "";
  const checkOut = checkIn ? isoDate(addDays(parseDate(checkIn), Math.max(1, numberValue(cotacao.noites)))) : "";
  return {
    hospede: cotacao.cliente,
    telefone: cotacao.telefone,
    cabana: cotacao.cabana,
    canal: cotacao.canal,
    checkIn,
    checkOut,
    valorBruto: cotacao.valorSugerido,
    valorPago: 0,
    adultos: cotacao.adultos,
    criancas: cotacao.criancas,
    pets: cotacao.pets,
    status: "Reservado",
    limpeza: "Pendente",
    origemCotacaoId: cotacao.id,
  };
}

function calcQuote(data, form) {
  const noites = Math.max(1, numberValue(form.noites || 1));
  const tarifa = findTariff(data.tarifasBase, form.periodo, form.tipo);
  const diariaBase = getTariffValue(tarifa, noites);
  const ajuste = data.ajusteUnidades.find((item) => item.Unidade === form.cabana);
  const ajusteUnidade = numberValue(ajuste?.["Variação %"]);
  const adultosExtras = Math.max(0, numberValue(form.adultos) - 2);
  const hospedagem = diariaBase * noites * (1 + ajusteUnidade);
  const pessoaExtra = adultosExtras * 200 * noites;
  const pet = numberValue(form.pets) * 80 * noites;
  const desconto = numberValue(form.desconto);
  const valorSugerido = Math.max(0, hospedagem + pessoaExtra + pet - desconto);
  const ota = data.otas.find((item) => item["Canal / OTA"] === form.canal);
  const comissaoRate = numberValue(ota?.["Comissão OTA %"]);
  const comissao = valorSugerido * comissaoRate;
  return {
    diariaBase,
    ajusteUnidade,
    hospedagem,
    pessoaExtra,
    pet,
    desconto,
    totalBruto: valorSugerido,
    valorSugerido,
    comissao,
    liquidoEstimado: valorSugerido - comissao,
  };
}

function findTariff(tarifas, periodo, tipo) {
  return tarifas.find((item) => item.Período === periodo && item.Tipo === tipo)
    ?? tarifas.find((item) => item.Período === periodo)
    ?? tarifas[0]
    ?? {};
}

function getTariffValue(tarifa, noites) {
  if (noites <= 1) return numberValue(tarifa["1 diária"]);
  if (noites === 2) return numberValue(tarifa["2 diárias"] || tarifa["1 diária"]);
  return numberValue(tarifa["3 diárias"] || tarifa["2 diárias"] || tarifa["1 diária"]);
}

function buildQuoteMessage(form, quote) {
  return `Olá, ${form.cliente || "tudo bem"}! Segue a cotação para o Rancho das Neves:\n\nCabana: ${form.cabana || "-"}\nPeríodo/tipo: ${form.periodo || "-"} / ${form.tipo || "-"}\nCheck-in previsto: ${form.checkIn ? formatDate(form.checkIn) : "-"}\nNoites: ${form.noites || 0}\nAdultos: ${form.adultos || 0}\nCrianças: ${form.criancas || 0}\nPets: ${form.pets || 0}\n\nValor da hospedagem: ${formatCurrency(quote.valorSugerido)}\n\nPara confirmar, seguimos com os dados do hóspede e forma de pagamento.`;
}

function defaultReservationForm() {
  return {
    adultos: 2,
    criancas: 0,
    pets: 0,
    valorPago: 0,
    status: "Reservado",
    limpeza: "Pendente",
  };
}

function buildReservationDraft(reserva = {}) {
  return {
    ...defaultReservationForm(),
    ...reserva,
  };
}

function findReservationConflict(reservas, draft, ignoreId = "") {
  return reservas.find((reserva) => reserva.id !== ignoreId && reservationOverlaps(reserva, draft));
}

function isDateEqual(value, targetIsoDate) {
  const date = parseDate(value);
  return !Number.isNaN(date.getTime()) && isoDate(date) === targetIsoDate;
}

function ReservationFields({ form, setForm, data }) {
  return (
    <>
      <Input label="Hóspede" value={form.hospede} onChange={(hospede) => setForm({ ...form, hospede })} required />
      <Input label="Telefone" value={form.telefone} onChange={(telefone) => setForm({ ...form, telefone })} />
      <Input label="E-mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <Input label="Documento" value={form.documento} onChange={(documento) => setForm({ ...form, documento })} />
      <Select label="Cabana" value={form.cabana} options={data.listas.cabanas_full ?? data.listas.cabanas} onChange={(cabana) => setForm({ ...form, cabana })} required />
      <Select label="Canal / OTA" value={form.canal} options={data.listas.canais_ota} onChange={(canal) => setForm({ ...form, canal })} />
      <Input label="Check-in" type="date" value={form.checkIn} onChange={(checkIn) => setForm({ ...form, checkIn })} required />
      <Input label="Check-out" type="date" value={form.checkOut} onChange={(checkOut) => setForm({ ...form, checkOut })} required />
      <Input label="Valor bruto" type="number" value={form.valorBruto} onChange={(valorBruto) => setForm({ ...form, valorBruto })} required />
      <Input label="Valor pago" type="number" value={form.valorPago} onChange={(valorPago) => setForm({ ...form, valorPago })} />
      <Input label="Adultos" type="number" value={form.adultos} onChange={(adultos) => setForm({ ...form, adultos })} />
      <Input label="Crianças" type="number" value={form.criancas} onChange={(criancas) => setForm({ ...form, criancas })} />
      <Input label="Pets" type="number" value={form.pets} onChange={(pets) => setForm({ ...form, pets })} />
      <Input label="Veículo / placa" value={form.veiculo} onChange={(veiculo) => setForm({ ...form, veiculo })} />
      <Input label="Observações" value={form.observacoes} onChange={(observacoes) => setForm({ ...form, observacoes })} />
      <Select label="Status" value={form.status} options={reservationStatusOptions(data)} onChange={(status) => setForm({ ...form, status })} />
      <Select label="Limpeza" value={form.limpeza} options={cleaningStatusOptions} onChange={(limpeza) => setForm({ ...form, limpeza })} />
    </>
  );
}

function Reservas({ data, addReserva, removeItem, updateItem }) {
  const [form, setForm] = useState(defaultReservationForm());
  const [selectedId, setSelectedId] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(defaultReservationForm());
  const [blockForm, setBlockForm] = useState({ tipo: "Manutenção" });
  const [filters, setFilters] = useState({ texto: "", status: "", cabana: "" });
  const [calendarStart, setCalendarStart] = useState(isoDate(new Date()));
  const selected = data.reservas.find((reserva) => reserva.id === selectedId) ?? data.reservas[0];
  const conflict = findReservationConflict(data.reservas, form);
  const editConflict = findReservationConflict(data.reservas, editForm, selected?.id);
  const blockConflict = findReservationConflict(data.reservas, blockForm);
  const noites = nightsBetween(form.checkIn, form.checkOut);
  const pendente = Math.max(0, numberValue(form.valorBruto) - numberValue(form.valorPago));
  const validationError = getReservationFormError(form, conflict);
  const editValidationError = selected ? getReservationFormError(editForm, editConflict) : "";
  const blockValidationError = getBlockFormError(blockForm, blockConflict);
  const selectedFolio = selected ? calcReservationFolio(selected, data.consumos, data.pagamentos) : null;
  const selectedPagamentos = selected ? (data.pagamentos ?? []).filter((item) => item.reservaId === selected.id) : [];
  const selectedConsumos = selected ? (data.consumos ?? []).filter((item) => item.reservaId === selected.id || (!item.reservaId && item.hospede === selected.hospede)) : [];
  const today = isoDate(new Date());
  const activeReservations = data.reservas.filter((reserva) => !["Cancelado", "Finalizada", "No-show"].includes(reserva.status));
  const blockedReservations = data.reservas.filter((reserva) => reserva.status === "Bloqueio");
  const occupiedToday = data.reservas.filter((reserva) => {
    const current = parseDate(today);
    const checkIn = parseDate(reserva.checkIn);
    const checkOut = parseDate(reserva.checkOut);
    return reserva.status !== "Cancelado" && checkIn <= current && current < checkOut;
  });
  const arrivalsToday = data.reservas.filter((reserva) => isDateEqual(reserva.checkIn, today));
  const departuresToday = data.reservas.filter((reserva) => isDateEqual(reserva.checkOut, today));
  const openBalance = data.reservas.reduce((total, reserva) => total + Math.max(0, calcReservationFolio(reserva, data.consumos, data.pagamentos).saldo), 0);
  const reservasFiltradas = data.reservas.filter((reserva) => {
    const termo = filters.texto.trim().toLowerCase();
    const textoOk = !termo || [reserva.id, reserva.hospede, reserva.telefone, reserva.email, reserva.documento, reserva.cabana]
      .some((value) => String(value ?? "").toLowerCase().includes(termo));
    const statusOk = !filters.status || (reserva.status || "Reservado") === filters.status;
    const cabanaOk = !filters.cabana || reserva.cabana === filters.cabana;
    return textoOk && statusOk && cabanaOk;
  });
  const submit = (event) => {
    event.preventDefault();
    if (validationError) {
      return;
    }
    addReserva(form);
    setForm(defaultReservationForm());
  };
  const selectReservation = (reserva) => {
    setSelectedId(reserva.id);
    setEditMode(false);
    setEditForm(buildReservationDraft(reserva));
  };
  const startEdit = (reserva) => {
    setSelectedId(reserva.id);
    setEditForm(buildReservationDraft(reserva));
    setEditMode(true);
  };
  const saveEdit = (event) => {
    event.preventDefault();
    if (!selected || editValidationError) return;
    updateItem("reservas", selected.id, editForm);
    setEditMode(false);
  };
  const submitBlock = (event) => {
    event.preventDefault();
    if (blockValidationError) return;
    addReserva({
      hospede: `Bloqueio - ${blockForm.motivo || blockForm.tipo || "Interno"}`,
      telefone: "",
      email: "",
      documento: "",
      cabana: blockForm.cabana,
      canal: "Interno",
      checkIn: blockForm.checkIn,
      checkOut: blockForm.checkOut,
      valorBruto: 0,
      valorPago: 0,
      adultos: 0,
      criancas: 0,
      pets: 0,
      veiculo: "",
      status: "Bloqueio",
      limpeza: blockForm.tipo === "Manutenção" ? "Manutenção" : "Pendente",
      observacoes: blockForm.motivo || blockForm.tipo,
    });
    setBlockForm({ tipo: "Manutenção" });
  };
  const deleteReservation = (reserva) => {
    secureRemove("reservas", reserva.id, removeItem, `reserva ${reserva.id} de ${reserva.hospede || "sem hóspede"}`);
    if (selectedId === reserva.id) {
      setSelectedId("");
      setEditMode(false);
    }
  };

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard">
          <span>Reservas ativas</span>
          <strong>{activeReservations.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Hospedados hoje</span>
          <strong>{occupiedToday.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Chegadas hoje</span>
          <strong>{arrivalsToday.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Saídas hoje</span>
          <strong>{departuresToday.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Saldo aberto</span>
          <strong className="negative">{formatCurrency(openBalance)}</strong>
        </article>
        <article className="kpiCard">
          <span>Bloqueios</span>
          <strong>{blockedReservations.length}</strong>
        </article>
      </section>
      <Panel title="Calendário de disponibilidade">
        <div className="calendarControls">
          <Input label="Início do calendário" type="date" value={calendarStart} onChange={setCalendarStart} />
          <div className="calendarLegend">
            <span><i className="legendFree" /> Livre</span>
            <span><i className="legendBusy" /> Ocupado</span>
            <span><i className="legendCheckout" /> Saída</span>
          </div>
        </div>
        <AvailabilityCalendar
          cabanas={data.listas.cabanas_full ?? data.listas.cabanas}
          reservas={data.reservas}
          startDate={calendarStart}
          onSelectSlot={(cabana, day) => setForm({
            ...form,
            cabana,
            checkIn: isoDate(day),
            checkOut: isoDate(addDays(day, 1)),
          })}
        />
      </Panel>
      <FormPanel title="Nova reserva" onSubmit={submit} submitLabel="Salvar reserva" disabled={Boolean(validationError)}>
        <ReservationFields form={form} setForm={setForm} data={data} />
        {validationError && <div className="formNotice">{validationError}</div>}
      </FormPanel>
      <FormPanel title="Bloquear cabana" onSubmit={submitBlock} submitLabel="Salvar bloqueio" disabled={Boolean(blockValidationError)}>
        <Select label="Cabana" value={blockForm.cabana} options={data.listas.cabanas_full ?? data.listas.cabanas} onChange={(cabana) => setBlockForm({ ...blockForm, cabana })} />
        <Select label="Tipo" value={blockForm.tipo} options={["Manutenção", "Uso interno", "Proprietário", "Bloqueio preventivo"]} onChange={(tipo) => setBlockForm({ ...blockForm, tipo })} />
        <Input label="Início" type="date" value={blockForm.checkIn} onChange={(checkIn) => setBlockForm({ ...blockForm, checkIn })} />
        <Input label="Fim" type="date" value={blockForm.checkOut} onChange={(checkOut) => setBlockForm({ ...blockForm, checkOut })} />
        <Input label="Motivo" value={blockForm.motivo} onChange={(motivo) => setBlockForm({ ...blockForm, motivo })} />
        {blockValidationError && <div className="formNotice">{blockValidationError}</div>}
      </FormPanel>
      <section className="contentGrid three">
        <Panel title="Resumo da reserva">
          <MetricLine label="Noites" value={noites} />
          <MetricLine label="Valor pago" value={formatCurrency(form.valorPago)} />
          <MetricLine label="Valor pendente" value={formatCurrency(pendente)} />
        </Panel>
        <Panel title="Disponibilidade">
          {conflict ? (
            <div className="alertBox">
              <strong>Conflito de data</strong>
              <span>{conflict.cabana} já está reservada para {conflict.hospede} nesse período.</span>
            </div>
          ) : (
            <div className="okBox">
              <strong>Sem conflito</strong>
              <span>Quando cabana e período estiverem preenchidos, o sistema bloqueia overbooking automaticamente.</span>
            </div>
          )}
        </Panel>
        <Panel title="Próximas ações">
          <MetricLine label="Confirmar pagamento" value={pendente > 0 ? "Sim" : "Quitado"} />
          <MetricLine label="Preparar limpeza" value={form.limpeza || "Pendente"} />
          <MetricLine label="Hóspedes" value={numberValue(form.adultos) + numberValue(form.criancas)} />
        </Panel>
      </section>
      <section className="contentGrid two">
        <Panel title="Detalhes da reserva">
          {selected && selectedFolio ? (
            <div className="reservationDetail">
              <div className="detailHeader">
                <div>
                  <p className="eyebrow">{selected.id}</p>
                  <h3>{selected.hospede || "Sem hóspede"}</h3>
                  <span>{selected.cabana || "-"} · {formatDate(selected.checkIn)} a {formatDate(selected.checkOut)}</span>
                </div>
                <span className={reservationStatusClass(selected.status)}>{selected.status || "Reservado"}</span>
              </div>
              <div className="detailMetrics">
                <MetricLine label="Noites" value={nightsBetween(selected.checkIn, selected.checkOut)} />
                <MetricLine label="Telefone" value={selected.telefone || "-"} />
                <MetricLine label="E-mail" value={selected.email || "-"} />
                <MetricLine label="Documento" value={selected.documento || "-"} />
                <MetricLine label="Veículo" value={selected.veiculo || "-"} />
                <MetricLine label="Limpeza" value={selected.limpeza || "Pendente"} />
                <MetricLine label="Total" value={formatCurrency(selectedFolio.total)} />
                <MetricLine label="Pago" value={formatCurrency(selectedFolio.pago)} />
                <MetricLine label="Saldo" value={formatCurrency(selectedFolio.saldo)} />
              </div>
              <ReservationStayFlow reserva={selected} folio={selectedFolio} updateItem={updateItem} />
              {selected.observacoes && <div className="noteBox"><strong>Observações</strong><span>{selected.observacoes}</span></div>}
              <div className="rowActions">
                <button className="smallButton" onClick={() => startEdit(selected)}>Editar</button>
                <button className="smallButton mutedButton" onClick={() => updateItem("reservas", selected.id, { limpeza: "Pronta" })}>Cabana pronta</button>
                <button className="smallButton mutedButton" onClick={() => updateItem("reservas", selected.id, { status: "Cancelado" })}>Cancelar</button>
                <button className="smallButton mutedButton" onClick={() => { window.location.hash = "pagamentos"; }}>Pagamento</button>
                <button className="smallButton mutedButton" onClick={() => { window.location.hash = "estoque"; }}>Consumo</button>
                <button className="smallButton mutedButton" onClick={() => { window.location.hash = "documentos"; }}>Documento</button>
              </div>
            </div>
          ) : (
            <p className="muted">Selecione uma reserva para ver detalhes.</p>
          )}
        </Panel>
        <Panel title={editMode ? "Editar reserva" : "Conta da reserva"}>
          {selected && editMode ? (
            <form className="formPanel" onSubmit={saveEdit} noValidate>
              <div className="formGrid compact">
                <ReservationFields form={editForm} setForm={setEditForm} data={data} />
                {editValidationError && <div className="formNotice">{editValidationError}</div>}
              </div>
              <div className="rowActions">
                <button className="primaryButton" type="submit" disabled={Boolean(editValidationError)}>Salvar alterações</button>
                <button className="smallButton mutedButton" type="button" onClick={() => setEditMode(false)}>Cancelar edição</button>
              </div>
            </form>
          ) : (
            <div className="reservationLedger">
              <MetricLine label="Hospedagem" value={formatCurrency(selectedFolio?.hospedagem ?? 0)} />
              <MetricLine label="Consumo" value={formatCurrency(selectedFolio?.consumo ?? 0)} />
              <MetricLine label="Total" value={formatCurrency(selectedFolio?.total ?? 0)} />
              <MetricLine label="Pago" value={formatCurrency(selectedFolio?.pago ?? 0)} />
              <MetricLine label="Saldo" value={formatCurrency(selectedFolio?.saldo ?? 0)} />
              <Table
                columns={["Pagamentos", "Valor"]}
                rows={selectedPagamentos.map((item) => [formatDate(item.data), formatCurrency(item.valor)])}
                empty="Nenhum pagamento vinculado."
              />
              <Table
                columns={["Consumo", "Valor"]}
                rows={selectedConsumos.map((item) => [item.produto || "-", formatCurrency(consumptionTotal(item))])}
                empty="Nenhum consumo vinculado."
              />
            </div>
          )}
        </Panel>
      </section>
      <Panel title="Reservas lançadas">
        <div className="filterBar">
          <Input label="Buscar" value={filters.texto} onChange={(texto) => setFilters({ ...filters, texto })} />
          <Select label="Status" value={filters.status} options={reservationStatusOptions(data)} onChange={(status) => setFilters({ ...filters, status })} />
          <Select label="Cabana" value={filters.cabana} options={data.listas.cabanas_full ?? data.listas.cabanas} onChange={(cabana) => setFilters({ ...filters, cabana })} />
        </div>
        <Table
          columns={["ID", "Hóspede", "Cabana", "Período", "Noites", "Canal", "Valor", "Pago", "Status", "Limpeza", "Ações"]}
          rows={reservasFiltradas.map((r) => [
            r.id,
            <div className="cellStack"><strong>{r.hospede}</strong><span>{r.telefone || r.email || "-"}</span></div>,
            r.cabana,
            `${formatDate(r.checkIn)} a ${formatDate(r.checkOut)}`,
            nightsBetween(r.checkIn, r.checkOut),
            r.canal,
            formatCurrency(r.valorBruto),
            formatCurrency(r.valorPago),
            <InlineSelect value={r.status || "Reservado"} options={reservationStatusOptions(data)} onChange={(status) => updateItem("reservas", r.id, { status })} />,
            <InlineSelect value={r.limpeza || "Pendente"} options={cleaningStatusOptions} onChange={(limpeza) => updateItem("reservas", r.id, { limpeza })} />,
            <div className="rowActions">
              <button className="smallButton" onClick={() => selectReservation(r)}>Ver</button>
              <button className="smallButton mutedButton" onClick={() => startEdit(r)}>Editar</button>
              <IconButton title="Excluir" onClick={() => deleteReservation(r)} icon={Trash2} />
            </div>,
          ])}
          empty="Nenhuma reserva lançada ainda."
        />
      </Panel>
      <Panel title="Contas de hóspedes">
        <Table
          columns={["Reserva", "Hóspede", "Hospedagem", "Consumo", "Total", "Pago", "Saldo"]}
          rows={data.reservas.map((reserva) => {
            const folio = calcReservationFolio(reserva, data.consumos, data.pagamentos);
            return [
              reserva.id,
              reserva.hospede,
              formatCurrency(folio.hospedagem),
              formatCurrency(folio.consumo),
              formatCurrency(folio.total),
              formatCurrency(folio.pago),
              <strong className={folio.saldo > 0 ? "negative" : ""}>{formatCurrency(folio.saldo)}</strong>,
            ];
          })}
          empty="Nenhuma conta aberta."
        />
      </Panel>
    </div>
  );
}

function ReservationStayFlow({ reserva, folio, updateItem }) {
  const checkin = stayFlowStatus(reserva, folio, "checkin");
  const checkout = stayFlowStatus(reserva, folio, "checkout");
  const setFlag = (field, checked) => updateItem("reservas", reserva.id, { [field]: checked });
  const completeCheckin = () => updateItem("reservas", reserva.id, {
    checkinDocumento: true,
    checkinSaldo: true,
    checkinCabana: true,
    checkinEnxoval: true,
    status: "Hospedado",
    checkinAt: new Date().toISOString(),
  });
  const completeCheckout = () => updateItem("reservas", reserva.id, {
    checkoutVistoria: true,
    checkoutConsumo: true,
    checkoutChaves: true,
    checkoutLimpeza: true,
    status: "Finalizada",
    limpeza: "Pendente",
    checkoutAt: new Date().toISOString(),
  });

  if (["Bloqueio", "Cancelado", "No-show"].includes(reserva.status)) {
    return (
      <div className="stayFlow compact">
        <div className="stayStage">
          <span className={reservationStatusClass(reserva.status)}>{reserva.status}</span>
          <strong>{reserva.status === "Bloqueio" ? "Período bloqueado" : "Reserva sem operação ativa"}</strong>
          <p>Use editar para alterar status, datas ou observações desta reserva.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stayFlow">
      <div className="stayStage">
        <span className={reservationStatusClass(reserva.status)}>{reserva.status || "Reservado"}</span>
        <strong>{stayStageLabel(reserva)}</strong>
        <p>{formatDate(reserva.checkIn)} a {formatDate(reserva.checkOut)} · saldo {formatCurrency(folio.saldo)}</p>
      </div>
      <div className="stayChecklistGrid">
        <div className="stayChecklist">
          <div className="stayChecklistHeader">
            <strong>Check-in</strong>
            <span className={checkin.done ? "status" : "status warn"}>{checkin.done ? "Pronto" : `${checkin.open} pend.`}</span>
          </div>
          {checkinChecklist.map(([field, label]) => (
            <Checkbox key={field} label={label} checked={Boolean(reserva[field])} onChange={(checked) => setFlag(field, checked)} />
          ))}
          {checkin.issues.length > 0 && (
            <ul className="flowIssues">
              {checkin.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
          <button className="primaryButton" type="button" onClick={completeCheckin}>Concluir check-in</button>
        </div>
        <div className="stayChecklist">
          <div className="stayChecklistHeader">
            <strong>Check-out</strong>
            <span className={checkout.done ? "status" : "status warn"}>{checkout.done ? "Pronto" : `${checkout.open} pend.`}</span>
          </div>
          {checkoutChecklist.map(([field, label]) => (
            <Checkbox key={field} label={label} checked={Boolean(reserva[field])} onChange={(checked) => setFlag(field, checked)} />
          ))}
          {checkout.issues.length > 0 && (
            <ul className="flowIssues">
              {checkout.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
          <button className="primaryButton" type="button" onClick={completeCheckout}>Concluir check-out</button>
        </div>
      </div>
      <div className="rowActions">
        <button className="smallButton mutedButton" type="button" onClick={() => updateItem("reservas", reserva.id, { status: "No-show" })}>No-show</button>
        <button className="smallButton mutedButton" type="button" onClick={() => updateItem("reservas", reserva.id, { status: "Reservado" })}>Voltar para reservado</button>
      </div>
    </div>
  );
}

function stayFlowStatus(reserva, folio, kind) {
  const fields = kind === "checkin" ? checkinChecklist : checkoutChecklist;
  const missing = fields.filter(([field]) => !reserva[field]).map(([, label]) => label);
  const issues = [...missing];
  if (kind === "checkin") {
    if (!reserva.documento) issues.unshift("Documento do hóspede não informado");
    if (!reserva.telefone) issues.unshift("Telefone do hóspede não informado");
    if ((reserva.limpeza || "Pendente") !== "Pronta" && !reserva.checkinCabana) issues.unshift("Cabana ainda não marcada como pronta");
    if (folio.saldo > 0 && !reserva.checkinSaldo) issues.unshift(`Saldo aberto: ${formatCurrency(folio.saldo)}`);
  } else if (folio.saldo > 0 && !reserva.checkoutConsumo) {
    issues.unshift(`Conferir saldo antes da saída: ${formatCurrency(folio.saldo)}`);
  }
  return {
    done: issues.length === 0,
    open: issues.length,
    issues: [...new Set(issues)],
  };
}

function stayStageLabel(reserva) {
  if (reserva.status === "Hospedado") return "Hóspede em casa";
  if (reserva.status === "Finalizada") return "Estadia finalizada";
  const today = isoDate(new Date());
  if (isDateEqual(reserva.checkIn, today)) return "Chegada hoje";
  if (isDateEqual(reserva.checkOut, today)) return "Saída hoje";
  if (parseDate(reserva.checkIn) > parseDate(today)) return "Reserva futura";
  if (parseDate(reserva.checkOut) < parseDate(today)) return "Revisar finalização";
  return "Estadia em andamento";
}

function reservationStatusClass(status = "Reservado") {
  if (["Cancelado", "No-show"].includes(status)) return "status danger";
  if (["Pendente", "Parcial", "Conferir repasse", "Aguardando repasse MT"].includes(status)) return "status warn";
  if (status === "Bloqueio") return "status neutral";
  return "status";
}

function getReservationFormError(form, conflict) {
  const isBlock = form.status === "Bloqueio";
  if (!isBlock && !String(form.hospede ?? "").trim()) return "Informe o nome do hóspede.";
  if (!form.cabana) return "Selecione a cabana.";
  if (!form.checkIn || Number.isNaN(parseDate(form.checkIn).getTime())) return "Informe um check-in válido.";
  if (!form.checkOut || Number.isNaN(parseDate(form.checkOut).getTime())) return "Informe um check-out válido.";
  if (parseDate(form.checkOut) <= parseDate(form.checkIn)) return "O check-out precisa ser depois do check-in.";
  if (!isBlock && numberValue(form.valorBruto) <= 0) return "Informe o valor bruto da reserva.";
  if (numberValue(form.valorPago) > numberValue(form.valorBruto)) return "O valor pago não pode ser maior que o valor bruto.";
  if (conflict) return `${conflict.cabana} já está reservada para ${conflict.hospede} nesse período.`;
  return "";
}

function getBlockFormError(form, conflict) {
  if (!form.cabana) return "Selecione a cabana para bloquear.";
  if (!form.checkIn || Number.isNaN(parseDate(form.checkIn).getTime())) return "Informe o início do bloqueio.";
  if (!form.checkOut || Number.isNaN(parseDate(form.checkOut).getTime())) return "Informe o fim do bloqueio.";
  if (parseDate(form.checkOut) <= parseDate(form.checkIn)) return "O fim do bloqueio precisa ser depois do início.";
  if (conflict) return `${conflict.cabana} já está ocupada por ${conflict.hospede} nesse período.`;
  return "";
}

function Usuarios({ data, addUser, addRole, addRolePermission, updateItem, removeItem, currentUser }) {
  const [userForm, setUserForm] = useState({ active: true, roleId: data.roles?.[0]?.id || "ROLE-RECEPCAO" });
  const [roleForm, setRoleForm] = useState({});
  const [pinForm, setPinForm] = useState({});
  const [auditFilters, setAuditFilters] = useState({ usuario: "", modulo: "", acao: "", data: "" });
  const roles = data.roles ?? [];
  const users = data.users ?? [];
  const permissions = data.rolePermissions ?? [];
  const roleOptions = roles.map((role) => `${role.id} - ${role.name}`);
  const currentAccount = getUserAccount(currentUser, users);
  const auditRows = (data.auditLogs ?? []).filter((log) => {
    const userOk = !auditFilters.usuario || String(log.username || log.userId || "").toLowerCase().includes(auditFilters.usuario.toLowerCase());
    const moduleOk = !auditFilters.modulo || log.module === auditFilters.modulo;
    const actionOk = !auditFilters.acao || String(log.action || "").toLowerCase().includes(auditFilters.acao.toLowerCase());
    const dataOk = !auditFilters.data || isoDate(parseDate(log.createdAt)) === auditFilters.data;
    return userOk && moduleOk && actionOk && dataOk;
  });
  const togglePermission = (roleId, module, action, allowed) => {
    const existing = permissions.find((permission) => permission.roleId === roleId && permission.module === module && permission.action === action);
    if (existing) {
      updateItem("rolePermissions", existing.id, { allowed });
      return;
    }
    addRolePermission({ id: `PERM-${roleId}-${module}-${action}`, roleId, module, action, allowed });
  };
    const submitUser = async (event) => {
        event.preventDefault();

        const role = getRole(userForm.roleId, roles);

        const newUser = {
            id: `USR-${Date.now()}`,
            name: userForm.name,
            username: userForm.username,
            email: userForm.email,
            pin: userForm.pin,
            roleId: role?.id || userForm.roleId,
            roleName: role?.name || "",
            active: userForm.active !== false,
        };

        addUser(newUser);

        setUserForm({
            active: true,
            roleId: data.roles?.[0]?.id || "ROLE-RECEPCAO"
        });

        try {
            await pushToGoogleSheets({
                ...data,
                users: [
                    ...(data.users ?? []),
                    newUser
                ]
            });

            alert("Usuário criado e enviado para o Google Sheets.");
        } catch (error) {
            console.error(error);
            alert(error?.message || JSON.stringify(error));
            alert("Usuário criado localmente, mas não foi enviado para o Google Sheets.");
        }
    };
  const submitRole = (event) => {
    event.preventDefault();
    const id = `ROLE-${normalizeKey(roleForm.name).replace(/\s+/g, "-").toUpperCase() || Date.now()}`;
    addRole({ id, name: roleForm.name, description: roleForm.description, locked: false });
    setRoleForm({});
  };
  const submitPin = (event) => {
    event.preventDefault();
    if (!currentAccount?.id) return;
    if (String(pinForm.currentPin ?? "") !== String(currentAccount.pin ?? "")) {
      alert("PIN atual incorreto.");
      return;
    }
    if (!pinForm.nextPin || pinForm.nextPin !== pinForm.confirmPin) {
      alert("Confirme o novo PIN corretamente.");
      return;
    }
    updateItem("users", currentAccount.id, { pin: pinForm.nextPin });
    setPinForm({});
  };
  const resetUserPin = (user) => {
    const nextPin = window.prompt(`Novo PIN para ${user.username}`);
    if (!nextPin) return;
    updateItem("users", user.id, { pin: nextPin });
  };

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard"><span>Usuários ativos</span><strong>{users.filter((user) => user.active !== false).length}</strong></article>
        <article className="kpiCard"><span>Perfis</span><strong>{roles.length}</strong></article>
        <article className="kpiCard"><span>Permissões</span><strong>{permissions.filter((permission) => permission.allowed !== false).length}</strong></article>
        <article className="kpiCard"><span>Auditoria</span><strong>{(data.auditLogs ?? []).length}</strong></article>
      </section>
      <section className="contentGrid two">
        <FormPanel title="Alterar meu PIN" onSubmit={submitPin} submitLabel="Atualizar PIN">
          <Input label="PIN atual" value={pinForm.currentPin} onChange={(currentPin) => setPinForm({ ...pinForm, currentPin })} required />
          <Input label="Novo PIN" value={pinForm.nextPin} onChange={(nextPin) => setPinForm({ ...pinForm, nextPin })} required />
          <Input label="Confirmar PIN" value={pinForm.confirmPin} onChange={(confirmPin) => setPinForm({ ...pinForm, confirmPin })} required />
        </FormPanel>
      </section>
      <section className="contentGrid two">
        <FormPanel title="Novo usuário" onSubmit={submitUser} submitLabel="Salvar usuário">
          <Input label="Nome" value={userForm.name} onChange={(name) => setUserForm({ ...userForm, name })} required />
          <Input label="Usuário / e-mail" value={userForm.username} onChange={(username) => setUserForm({ ...userForm, username })} required />
          <Input label="E-mail" value={userForm.email} onChange={(email) => setUserForm({ ...userForm, email })} />
          <Input label="PIN / senha" value={userForm.pin} onChange={(pin) => setUserForm({ ...userForm, pin })} required />
          <Select label="Perfil" value={userForm.roleId} options={roleOptions} onChange={(roleId) => setUserForm({ ...userForm, roleId: roleId.split(" - ")[0] })} />
          <Checkbox label="Ativo" checked={userForm.active !== false} onChange={(active) => setUserForm({ ...userForm, active })} />
        </FormPanel>
        <FormPanel title="Novo perfil" onSubmit={submitRole} submitLabel="Criar perfil">
          <Input label="Nome do perfil" value={roleForm.name} onChange={(name) => setRoleForm({ ...roleForm, name })} required />
          <Input label="Descrição" value={roleForm.description} onChange={(description) => setRoleForm({ ...roleForm, description })} />
        </FormPanel>
      </section>
      <Panel title="Usuários">
        <Table
          columns={["Nome", "Usuário", "Perfil", "Status", "Ações"]}
          rows={users.map((user) => {
            const role = roles.find((item) => item.id === user.roleId);
            return [
              user.name || "-",
              user.username,
              role?.name || user.roleId,
              <InlineSelect value={user.active === false ? "Inativo" : "Ativo"} options={["Ativo", "Inativo"]} onChange={(status) => updateItem("users", user.id, { active: status === "Ativo" })} />,
              <div className="rowActions">
                <InlineSelect value={user.roleId} options={roleOptions} onChange={(roleId) => updateItem("users", user.id, { roleId: roleId.split(" - ")[0] })} />
                <button className="smallButton mutedButton" type="button" onClick={() => resetUserPin(user)}>Reset PIN</button>
                {!user.locked && <IconButton title="Excluir" onClick={() => secureRemove("users", user.id, removeItem, `usuário ${user.username}`)} icon={Trash2} />}
              </div>,
            ];
          })}
          empty="Nenhum usuário cadastrado."
        />
      </Panel>
      <Panel title="Matriz de permissões por perfil">
        <Table
          columns={["Módulo", ...roles.map((role) => role.name)]}
          rows={Object.entries(moduleLabels).map(([module, label]) => [
            <div className="cellStack"><strong>{label}</strong><span>{module}</span></div>,
            ...roles.map((role) => (
              <div className="permissionStack" key={`${role.id}-${module}`}>
                {permissionActions.map((action) => {
                  const checked = permissions.some((permission) => permission.roleId === role.id && permission.module === module && permission.action === action && permission.allowed !== false);
                  return (
                    <label key={action} title={permissionActionLabels[action]}>
                      <input type="checkbox" checked={checked} onChange={(event) => togglePermission(role.id, module, action, event.target.checked)} />
                      <span>{permissionActionLabels[action]}</span>
                    </label>
                  );
                })}
              </div>
            )),
          ])}
          empty="Nenhum perfil cadastrado."
        />
      </Panel>
      <Panel title="Auditoria recente">
        <div className="formGrid compact">
          <Input label="Usuário" value={auditFilters.usuario} onChange={(usuario) => setAuditFilters({ ...auditFilters, usuario })} />
          <Select label="Módulo" value={auditFilters.modulo} options={Object.keys(moduleLabels)} onChange={(modulo) => setAuditFilters({ ...auditFilters, modulo })} />
          <Input label="Ação" value={auditFilters.acao} onChange={(acao) => setAuditFilters({ ...auditFilters, acao })} />
          <Input label="Data" type="date" value={auditFilters.data} onChange={(dataValue) => setAuditFilters({ ...auditFilters, data: dataValue })} />
        </div>
        <Table
          columns={["Data", "Usuário", "Ação", "Módulo", "Registro"]}
          rows={auditRows.slice(0, 120).map((log) => [
            formatDate(log.createdAt),
            log.username || log.userId,
            log.action,
            moduleLabels[log.module] || log.module,
            log.recordId || log.details || "-",
          ])}
          empty="Nenhum evento de auditoria registrado."
        />
      </Panel>
    </div>
  );
}

function getRole(idOrLabel, roles = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return roles.find((role) => role.id === clean);
}

function Financeiro({ data, addFinanceiro, removeItem }) {
  const [kind, setKind] = useState("receitasExtras");
  const [form, setForm] = useState({});
  const submit = (event) => {
    event.preventDefault();
    addFinanceiro(kind, form);
    setForm({});
  };

  return (
    <div className="viewStack">
      <div className="segmented">
        <button className={kind === "receitasExtras" ? "active" : ""} onClick={() => setKind("receitasExtras")}>Receita extra</button>
        <button className={kind === "despesas" ? "active" : ""} onClick={() => setKind("despesas")}>Despesa</button>
      </div>
      <FormPanel title={kind === "receitasExtras" ? "Lançar receita extra" : "Lançar despesa"} onSubmit={submit}>
        <Input label="Data" type="date" value={form.data} onChange={(dataValue) => setForm({ ...form, data: dataValue })} required />
        <Select
          label="Categoria"
          value={form.categoria}
          options={kind === "receitasExtras" ? data.listas.receitas_extra : data.listas.categorias_despesa}
          onChange={(categoria) => setForm({ ...form, categoria })}
          required
        />
        <Input label={kind === "receitasExtras" ? "Cliente / responsável" : "Fornecedor / pago para"} value={form.nome} onChange={(nome) => setForm({ ...form, nome })} />
        <Input label="Descrição" value={form.descricao} onChange={(descricao) => setForm({ ...form, descricao })} />
        <Input label="Valor" type="number" value={form.valor} onChange={(valor) => setForm({ ...form, valor })} required />
        <Select label="Forma de pagamento" value={form.formaPagamento} options={data.listas.formas_pgto} onChange={(formaPagamento) => setForm({ ...form, formaPagamento })} />
      </FormPanel>
      <section className="contentGrid two">
        <Panel title="Receitas extras">
          <FinanceTable rows={data.receitasExtras} type="receitasExtras" removeItem={removeItem} />
        </Panel>
        <Panel title="Despesas">
          <FinanceTable rows={data.despesas} type="despesas" removeItem={removeItem} />
        </Panel>
      </section>
    </div>
  );
}

function FinanceTable({ rows, type, removeItem }) {
  return (
    <Table
      columns={["Data", "Categoria", "Nome", "Valor", ""]}
      rows={rows.map((item) => [
        formatDate(item.data),
        item.categoria,
        item.nome,
        formatCurrency(item.valor),
        <IconButton title="Excluir" onClick={() => secureRemove(type, item.id, removeItem, "lançamento financeiro")} icon={Trash2} />,
      ])}
      empty="Nenhum lançamento."
    />
  );
}

function Pagamentos({ data, addPagamento, updateItem, removeItem }) {
  const [form, setForm] = useState({ data: isoDate(new Date()), vencimento: isoDate(new Date()), status: "Recebido", tipo: "Sinal" });
  const [filters, setFilters] = useState({ status: "", reserva: "" });
  const reservasAtivas = data.reservas.filter((item) => item.status !== "Cancelado");
  const reservaOptions = reservasAtivas.map((item) => `${item.id} | ${item.hospede} | ${item.cabana}`);
  const selectedReserva = data.reservas.find((item) => item.id === form.reservaId);
  const selectedFolio = selectedReserva ? calcReservationFolio(selectedReserva, data.consumos, data.pagamentos) : null;
  const pagamentos = data.pagamentos ?? [];
  const recebidos = pagamentos.filter((item) => !item.status || ["Recebido", "Conciliado"].includes(item.status));
  const previstos = pagamentos.filter((item) => item.status === "Previsto");
  const vencidos = previstos.filter((item) => parseDate(item.vencimento) < parseDate(isoDate(new Date())));
  const pagamentosHoje = recebidos.filter((item) => isDateEqual(item.data, isoDate(new Date())));
  const totalHoje = pagamentosHoje.reduce((total, item) => total + numberValue(item.valor), 0);
  const totalRecebido = recebidos.reduce((total, item) => total + numberValue(item.valor), 0);
  const totalPrevisto = previstos.reduce((total, item) => total + numberValue(item.valor), 0);
  const porForma = Object.values(
    recebidos.reduce((acc, item) => {
      const label = item.formaPagamento || "Sem forma";
      acc[label] ??= { label, total: 0 };
      acc[label].total += numberValue(item.valor);
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  const selectReserva = (value) => {
    const reservaId = value.split(" | ")[0];
    const reserva = data.reservas.find((item) => item.id === reservaId);
    const folio = reserva ? calcReservationFolio(reserva, data.consumos, data.pagamentos) : null;
    setForm({
      ...form,
      reservaLabel: value,
      reservaId,
      hospede: reserva?.hospede ?? "",
      cabana: reserva?.cabana ?? "",
      valor: form.valor || Math.max(0, folio?.saldo ?? 0),
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.reservaId || numberValue(form.valor) <= 0) return;
    addPagamento({
      ...form,
      parcela: form.parcela || buildInstallmentLabel(form),
      conciliado: form.status === "Conciliado" ? "Sim" : "Não",
    });
    setForm({ data: isoDate(new Date()), vencimento: isoDate(new Date()), status: "Recebido", tipo: "Sinal" });
  };

  const filteredPayments = pagamentos.filter((item) => {
    const statusOk = !filters.status || (item.status || "Recebido") === filters.status;
    const reservaOk = !filters.reserva || item.reservaId === filters.reserva.split(" | ")[0];
    return statusOk && reservaOk;
  });

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard">
          <span>Recebido hoje</span>
          <strong>{formatCurrency(totalHoje)}</strong>
        </article>
        <article className="kpiCard">
          <span>Pagamentos hoje</span>
          <strong>{pagamentosHoje.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Total recebido</span>
          <strong>{formatCurrency(totalRecebido)}</strong>
        </article>
        <article className="kpiCard">
          <span>Previsto</span>
          <strong>{formatCurrency(totalPrevisto)}</strong>
        </article>
        <article className="kpiCard">
          <span>Vencidos</span>
          <strong className={vencidos.length ? "negative" : ""}>{vencidos.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Reservas com saldo</span>
          <strong>{data.reservas.filter((reserva) => calcReservationFolio(reserva, data.consumos, data.pagamentos).saldo > 0).length}</strong>
        </article>
      </section>

      <FormPanel title="Registrar pagamento ou parcela" onSubmit={submit} submitLabel="Salvar pagamento" disabled={!form.reservaId || numberValue(form.valor) <= 0}>
        <Input label="Data" type="date" value={form.data} onChange={(dataValue) => setForm({ ...form, data: dataValue })} />
        <Input label="Vencimento" type="date" value={form.vencimento} onChange={(vencimento) => setForm({ ...form, vencimento })} />
        <Select label="Reserva" value={form.reservaLabel} options={reservaOptions} onChange={selectReserva} />
        <Select label="Tipo" value={form.tipo} options={paymentTypeOptions} onChange={(tipo) => setForm({ ...form, tipo })} />
        <Input label="Hóspede" value={form.hospede} onChange={(hospede) => setForm({ ...form, hospede })} />
        <Input label="Cabana" value={form.cabana} onChange={(cabana) => setForm({ ...form, cabana })} />
        <Input label="Valor" type="number" value={form.valor} onChange={(valor) => setForm({ ...form, valor })} />
        <Select label="Forma de pagamento" value={form.formaPagamento} options={data.listas.formas_pgto} onChange={(formaPagamento) => setForm({ ...form, formaPagamento })} />
        <Select label="Status" value={form.status} options={paymentStatusOptions} onChange={(status) => setForm({ ...form, status })} />
        <Input label="Parcela" value={form.parcela} onChange={(parcela) => setForm({ ...form, parcela })} />
        <Input label="Comprovante" value={form.comprovante} onChange={(comprovante) => setForm({ ...form, comprovante })} />
        <Input label="Recebido por" value={form.recebidoPor} onChange={(recebidoPor) => setForm({ ...form, recebidoPor })} />
        <Input label="Observações" value={form.observacoes} onChange={(observacoes) => setForm({ ...form, observacoes })} />
      </FormPanel>

      <section className="contentGrid two">
        <Panel title="Resumo da reserva">
          {selectedFolio ? (
            <>
              <MetricLine label="Hospedagem" value={formatCurrency(selectedFolio.hospedagem)} />
              <MetricLine label="Consumo" value={formatCurrency(selectedFolio.consumo)} />
              <MetricLine label="Total" value={formatCurrency(selectedFolio.total)} />
              <MetricLine label="Pago confirmado" value={formatCurrency(selectedFolio.pago)} />
              <MetricLine label="Saldo" value={formatCurrency(selectedFolio.saldo)} />
            </>
          ) : (
            <p className="muted">Selecione uma reserva para ver o saldo.</p>
          )}
        </Panel>
        <Panel title="Recebimento por forma">
          <SimpleBars rows={porForma} valueKey="total" labelKey="label" />
        </Panel>
      </section>

      <Panel title="Extrato de pagamentos">
        <div className="filterBar">
          <Select label="Status" value={filters.status} options={paymentStatusOptions} onChange={(status) => setFilters({ ...filters, status })} />
          <Select label="Reserva" value={filters.reserva} options={reservaOptions} onChange={(reserva) => setFilters({ ...filters, reserva })} />
        </div>
        <Table
          columns={["Data", "Vencimento", "Reserva", "Tipo", "Parcela", "Forma", "Status", "Valor", "Comprovante", "Ações"]}
          rows={filteredPayments.map((item) => [
            formatDate(item.data),
            formatDate(item.vencimento),
            item.reservaId || "-",
            item.tipo || "-",
            item.parcela || "-",
            item.formaPagamento || "-",
            <InlineSelect value={item.status || "Recebido"} options={paymentStatusOptions} onChange={(status) => updateItem("pagamentos", item.id, { status, conciliado: status === "Conciliado" ? "Sim" : "Não" })} />,
            formatCurrency(item.valor),
            item.comprovante || "-",
            <div className="rowActions">
              <button className="smallButton mutedButton" onClick={() => updateItem("pagamentos", item.id, { status: "Conciliado", conciliado: "Sim" })}>Conciliar</button>
              <IconButton title="Excluir" onClick={() => secureRemove("pagamentos", item.id, removeItem, `pagamento de ${formatCurrency(item.valor)}`)} icon={Trash2} />
            </div>,
          ])}
          empty="Nenhum pagamento registrado."
        />
      </Panel>
    </div>
  );
}

function buildInstallmentLabel(form) {
  if (form.tipo === "Sinal") return "Sinal";
  if (form.tipo?.includes("Restante")) return form.tipo;
  return form.vencimento ? `Parcela ${formatDate(form.vencimento)}` : form.tipo || "Pagamento";
}

function paymentStatusClass(status = "Recebido") {
  if (status === "Previsto") return "status warn";
  if (status === "Estornado") return "status danger";
  return "status";
}

function Tarefas({ data, addTarefa, updateItem, removeItem }) {
  const [form, setForm] = useState({ status: "Pendente", prioridade: "Média", tipo: "Limpeza" });
  const reservaOptions = data.reservas.map((item) => `${item.id} | ${item.hospede} | ${item.cabana}`);
  const tarefas = data.tarefas ?? [];
  const abertas = tarefas.filter((item) => item.status !== "Concluída");
  const concluidas = tarefas.filter((item) => item.status === "Concluída");
  const atrasadas = abertas.filter((item) => {
    const prazo = parseDate(item.prazo);
    const hoje = parseDate(isoDate(new Date()));
    return !Number.isNaN(prazo.getTime()) && prazo < hoje;
  });
  const porCabana = Object.values(
    abertas.reduce((acc, item) => {
      const label = item.cabana || "Sem cabana";
      acc[label] ??= { label, total: 0 };
      acc[label].total += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  const selectReserva = (value) => {
    const reservaId = value.split(" | ")[0];
    const reserva = data.reservas.find((item) => item.id === reservaId);
    setForm({
      ...form,
      reservaLabel: value,
      reservaId,
      hospede: reserva?.hospede ?? "",
      cabana: reserva?.cabana ?? "",
    });
  };

  const submit = (event) => {
    event.preventDefault();
    addTarefa(form);
    setForm({ status: "Pendente", prioridade: "Média", tipo: "Limpeza" });
  };

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard">
          <span>Abertas</span>
          <strong>{abertas.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Atrasadas</span>
          <strong className={atrasadas.length ? "negative" : ""}>{atrasadas.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Concluídas</span>
          <strong>{concluidas.length}</strong>
        </article>
        <article className="kpiCard">
          <span>Alta prioridade</span>
          <strong>{abertas.filter((item) => item.prioridade === "Alta").length}</strong>
        </article>
      </section>

      <FormPanel title="Nova tarefa" onSubmit={submit}>
        <Select label="Tipo" value={form.tipo} options={["Limpeza", "Manutenção", "Compras", "Recepção", "Financeiro", "Outro"]} onChange={(tipo) => setForm({ ...form, tipo })} />
        <Select label="Reserva" value={form.reservaLabel} options={reservaOptions} onChange={selectReserva} />
        <Select label="Cabana" value={form.cabana} options={data.listas.cabanas_full ?? data.listas.cabanas} onChange={(cabana) => setForm({ ...form, cabana })} />
        <Input label="Título" value={form.titulo} onChange={(titulo) => setForm({ ...form, titulo })} />
        <Input label="Responsável" value={form.responsavel} onChange={(responsavel) => setForm({ ...form, responsavel })} />
        <Input label="Prazo" type="date" value={form.prazo} onChange={(prazo) => setForm({ ...form, prazo })} />
        <Select label="Prioridade" value={form.prioridade} options={["Baixa", "Média", "Alta"]} onChange={(prioridade) => setForm({ ...form, prioridade })} />
        <Select label="Status" value={form.status} options={["Pendente", "Em andamento", "Concluída"]} onChange={(status) => setForm({ ...form, status })} />
        <Input label="Observações" value={form.observacoes} onChange={(observacoes) => setForm({ ...form, observacoes })} />
      </FormPanel>

      <section className="contentGrid two">
        <Panel title="Pendências por cabana">
          <SimpleBars rows={porCabana} valueKey="total" labelKey="label" />
        </Panel>
        <Panel title="Atrasadas">
          <TaskTable rows={atrasadas} updateItem={updateItem} removeItem={removeItem} empty="Nenhuma tarefa atrasada." />
        </Panel>
      </section>

      <Panel title="Tarefas abertas">
        <TaskTable rows={abertas} updateItem={updateItem} removeItem={removeItem} empty="Nenhuma tarefa aberta." />
      </Panel>

      <Panel title="Tarefas concluídas">
        <TaskTable rows={concluidas} updateItem={updateItem} removeItem={removeItem} empty="Nenhuma tarefa concluída." />
      </Panel>
    </div>
  );
}

function TaskTable({ rows, updateItem, removeItem, empty }) {
  return (
    <Table
      columns={["Tipo", "Título", "Cabana", "Prazo", "Prioridade", "Responsável", "Status", "Ações"]}
      rows={rows.map((item) => [
        item.tipo,
        item.titulo || item.observacoes || "-",
        item.cabana || "-",
        formatDate(item.prazo),
        <span className={item.prioridade === "Alta" ? "status danger" : "status"}>{item.prioridade || "Média"}</span>,
        item.responsavel || "-",
        <InlineSelect value={item.status || "Pendente"} options={["Pendente", "Em andamento", "Concluída"]} onChange={(status) => updateItem("tarefas", item.id, { status })} />,
        <div className="rowActions">
          <button className="smallButton" onClick={() => updateItem("tarefas", item.id, { status: "Concluída" })}>Concluir</button>
          <IconButton title="Excluir" onClick={() => secureRemove("tarefas", item.id, removeItem, `tarefa ${item.titulo || item.tipo || ""}`)} icon={Trash2} />
        </div>,
      ])}
      empty={empty}
    />
  );
}

const stockUnits = ["un", "g", "kg", "ml", "l", "pacote", "caixa", "fatia"];

function Estoque({ data, addConsumo, addIngredient, addMenuProduct, addRecipeItem, addStockMovement, addSupplier, addPurchaseInvoice, addPurchaseInvoiceItem, addAccountPayable, addSupplierProductMapping, addFinanceiro, updateItem, removeItem, canAction = () => true }) {
  const [saleForm, setSaleForm] = useState({ data: isoDate(new Date()), quantidade: 1 });
  const [ingredientForm, setIngredientForm] = useState({ baseUnit: "un", active: true });
  const [productForm, setProductForm] = useState({ active: true, allowIndividualSale: true });
  const [recipeForm, setRecipeForm] = useState({ quantity: 1, unit: "un", conversionFactor: 1, wastePercent: 0 });
  const [movementForm, setMovementForm] = useState({ movementType: "ajuste_positivo", unit: "un", data: isoDate(new Date()) });
  const [inventoryForm, setInventoryForm] = useState({ data: isoDate(new Date()) });
  const [stockView, setStockView] = useState("vendas");
  const [supplierForm, setSupplierForm] = useState({ active: true });
  const [invoiceForm, setInvoiceForm] = useState({ status: "rascunho", entryDate: isoDate(new Date()), installments: 1 });
  const [invoiceItemForm, setInvoiceItemForm] = useState({ purchaseUnit: "un", stockUnit: "un", conversionFactor: 1 });
  const [xmlImport, setXmlImport] = useState({ status: "idle", message: "", parsed: null });
  const [purchaseListMessage, setPurchaseListMessage] = useState("");
  const ingredients = data.ingredients ?? [];
  const menuProducts = data.menuProducts ?? [];
  const recipeItems = data.recipeItems ?? [];
  const stockMovements = data.stockMovements ?? [];
  const suppliers = data.suppliers ?? [];
  const purchaseInvoices = data.purchaseInvoices ?? [];
  const purchaseInvoiceItems = data.purchaseInvoiceItems ?? [];
  const accountsPayable = data.accountsPayable ?? [];
  const supplierProductMappings = data.supplierProductMappings ?? [];
  const reservasAtivas = data.reservas.filter((item) => item.status !== "Cancelado");
  const reservaOptions = reservasAtivas.map((item) => `${item.id} | ${item.hospede} | ${item.cabana}`);
  const menuOptions = menuProducts.map((item) => `${item.id} - ${item.name}`);
  const ingredientOptions = ingredients.map((item) => `${item.id} - ${item.name}`);
  const supplierOptions = suppliers.map((item) => `${item.id} - ${item.name}`);
  const invoiceOptions = purchaseInvoices.map((item) => `${item.id} - ${item.invoiceNumber || item.supplierName || "Nota"}`);
  const selectedProduct = getMenuProduct(saleForm.productId, menuProducts);
  const saleAvailability = selectedProduct ? checkProductAvailability(selectedProduct.id, numberValue(saleForm.quantidade) || 1, ingredients, recipeItems) : { blockers: [], warnings: [] };
  const recipeProduct = getMenuProduct(recipeForm.productId, menuProducts) ?? menuProducts[0];
  const recipeSummary = recipeProduct ? calculateRecipeSummary(recipeProduct, ingredients, recipeItems) : null;
  const kitchenAlerts = buildKitchenAlerts(ingredients, menuProducts, recipeItems);
  const menuEngineering = buildMenuEngineering(menuProducts, ingredients, recipeItems, data.consumos ?? []);
  const payableSummary = buildAccountsPayableSummary(accountsPayable);
  const payableRows = sortAccountsPayable(accountsPayable);
  const purchasePlan = buildPurchasePlan(ingredients, purchaseInvoiceItems, purchaseInvoices);
  const purchaseListText = buildPurchaseListText(purchasePlan);
  const stockLotAlerts = buildStockLotAlerts(purchaseInvoiceItems, purchaseInvoices);
  const supplierPurchaseSummary = buildSupplierPurchaseSummary(purchaseInvoices, purchaseInvoiceItems, accountsPayable);
  const inventoryIngredient = getIngredient(inventoryForm.ingredientId, ingredients);
  const inventoryFactor = inventoryIngredient ? unitConversionFactor(inventoryForm.unit || inventoryIngredient.baseUnit, inventoryIngredient.baseUnit) : 1;
  const inventoryCountedBase = numberValue(inventoryForm.countedQuantity) * inventoryFactor;
  const inventoryDifference = inventoryIngredient ? inventoryCountedBase - numberValue(inventoryIngredient.currentStock) : 0;

  const selectReserva = (value) => {
    const reservaId = value.split(" | ")[0];
    const reserva = data.reservas.find((item) => item.id === reservaId);
    setSaleForm({
      ...saleForm,
      reservaId,
      reservaLabel: value,
      hospede: reserva?.hospede ?? "",
      cabana: reserva?.cabana ?? "",
    });
  };
  const selectSaleProduct = (value) => {
    const product = getMenuProduct(value, menuProducts);
    setSaleForm({
      ...saleForm,
      productId: value,
      produto: product?.name || value,
      valorVenda: product?.salePrice || saleForm.valorVenda || "",
    });
  };
  const submitSale = (event) => {
    event.preventDefault();
    if (saleAvailability.blockers.length) return;
    const qty = numberValue(saleForm.quantidade) || 1;
    addConsumo(saleForm);
    if (selectedProduct) {
      recipeItems.filter((item) => item.productId === selectedProduct.id).forEach((item) => {
        const ingredient = ingredients.find((row) => row.id === item.ingredientId);
        if (!ingredient) return;
        const used = recipeQuantityInBase(item) * qty;
        updateItem("ingredients", ingredient.id, { currentStock: numberValue(ingredient.currentStock) - used });
        addStockMovement({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          movementType: "saida_venda",
          quantity: -used,
          unit: ingredient.baseUnit,
          unitCost: ingredient.averageCost,
          totalCost: used * numberValue(ingredient.averageCost),
          referenceType: "consumo_hospede",
          referenceId: selectedProduct.id,
          reason: `Venda de ${qty}x ${selectedProduct.name}`,
          data: saleForm.data || isoDate(new Date()),
        });
      });
    }
    setSaleForm({ data: isoDate(new Date()), quantidade: 1 });
  };
  const submitIngredient = (event) => {
    event.preventDefault();
    addIngredient({
      name: ingredientForm.name,
      category: ingredientForm.category,
      baseUnit: ingredientForm.baseUnit,
      averageCost: numberValue(ingredientForm.averageCost),
      currentStock: numberValue(ingredientForm.currentStock),
      minimumStock: numberValue(ingredientForm.minimumStock),
      defaultSupplier: ingredientForm.defaultSupplier,
      internalCode: ingredientForm.internalCode,
      barcode: ingredientForm.barcode,
      expirationDate: ingredientForm.expirationDate,
      active: ingredientForm.active !== false,
    });
    setIngredientForm({ baseUnit: "un", active: true });
  };
  const submitProduct = (event) => {
    event.preventDefault();
    addMenuProduct({
      name: productForm.name,
      category: productForm.category,
      description: productForm.description,
      salePrice: numberValue(productForm.salePrice),
      imageUrl: productForm.imageUrl,
      preparationTimeMinutes: numberValue(productForm.preparationTimeMinutes),
      active: productForm.active !== false,
      allowIndividualSale: productForm.allowIndividualSale !== false,
      internalNotes: productForm.internalNotes,
    });
    setProductForm({ active: true, allowIndividualSale: true });
  };
  const submitRecipe = (event) => {
    event.preventDefault();
    const ingredient = getIngredient(recipeForm.ingredientId, ingredients);
    const product = getMenuProduct(recipeForm.productId, menuProducts);
    if (!ingredient || !product) return;
    addRecipeItem({
      productId: product.id,
      productName: product.name,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity: numberValue(recipeForm.quantity),
      unit: recipeForm.unit,
      conversionFactor: numberValue(recipeForm.conversionFactor) || unitConversionFactor(recipeForm.unit, ingredient.baseUnit),
      wastePercent: numberValue(recipeForm.wastePercent),
      unitCostSnapshot: numberValue(ingredient.averageCost),
    });
    setRecipeForm({ productId: `${product.id} - ${product.name}`, quantity: 1, unit: ingredient.baseUnit, conversionFactor: 1, wastePercent: 0 });
  };
  const submitMovement = (event) => {
    event.preventDefault();
    const ingredient = getIngredient(movementForm.ingredientId, ingredients);
    if (!ingredient) return;
    const factor = unitConversionFactor(movementForm.unit, ingredient.baseUnit);
    const signed = movementSign(movementForm.movementType) * numberValue(movementForm.quantity) * factor;
    updateItem("ingredients", ingredient.id, { currentStock: numberValue(ingredient.currentStock) + signed });
    addStockMovement({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      movementType: movementForm.movementType,
      quantity: signed,
      unit: ingredient.baseUnit,
      unitCost: ingredient.averageCost,
      totalCost: Math.abs(signed) * numberValue(ingredient.averageCost),
      reason: movementForm.reason,
      data: movementForm.data || isoDate(new Date()),
    });
    setMovementForm({ movementType: "ajuste_positivo", unit: "un", data: isoDate(new Date()) });
  };
  const submitInventoryCount = (event) => {
    event.preventDefault();
    const ingredient = getIngredient(inventoryForm.ingredientId, ingredients);
    if (!ingredient) return;
    const factor = unitConversionFactor(inventoryForm.unit || ingredient.baseUnit, ingredient.baseUnit);
    const countedBase = numberValue(inventoryForm.countedQuantity) * factor;
    const currentStock = numberValue(ingredient.currentStock);
    const difference = countedBase - currentStock;
    updateItem("ingredients", ingredient.id, { currentStock: countedBase });
    addStockMovement({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      movementType: "contagem_inventario",
      quantity: difference,
      unit: ingredient.baseUnit,
      unitCost: ingredient.averageCost,
      totalCost: Math.abs(difference) * numberValue(ingredient.averageCost),
      reason: inventoryForm.reason || `Contagem física: sistema ${currentStock} ${ingredient.baseUnit}, contado ${countedBase} ${ingredient.baseUnit}`,
      data: inventoryForm.data || isoDate(new Date()),
    });
    setInventoryForm({ data: isoDate(new Date()) });
  };
  const submitSupplier = (event) => {
    event.preventDefault();
    addSupplier({
      name: supplierForm.name,
      cnpj: supplierForm.cnpj,
      phone: supplierForm.phone,
      email: supplierForm.email,
      address: supplierForm.address,
      active: supplierForm.active !== false,
    });
    setSupplierForm({ active: true });
  };
  const submitInvoice = (event) => {
    event.preventDefault();
    const supplier = getSupplier(invoiceForm.supplierId, suppliers);
    const invoiceId = `NFE-${Date.now()}`;
    addPurchaseInvoice({
      id: invoiceId,
      supplierId: supplier?.id || "",
      supplierName: supplier?.name || invoiceForm.supplierName || "",
      invoiceNumber: invoiceForm.invoiceNumber,
      invoiceSeries: invoiceForm.invoiceSeries,
      accessKey: invoiceForm.accessKey,
      issueDate: invoiceForm.issueDate,
      entryDate: invoiceForm.entryDate || isoDate(new Date()),
      productsTotal: numberValue(invoiceForm.productsTotal),
      freightTotal: numberValue(invoiceForm.freightTotal),
      discountTotal: numberValue(invoiceForm.discountTotal),
      taxTotal: numberValue(invoiceForm.taxTotal),
      invoiceTotal: numberValue(invoiceForm.invoiceTotal || invoiceForm.productsTotal),
      paymentMethod: invoiceForm.paymentMethod,
      installments: numberValue(invoiceForm.installments) || 1,
      notes: invoiceForm.notes,
      status: "rascunho",
    });
    setInvoiceItemForm({ ...invoiceItemForm, invoiceId: `${invoiceId} - ${invoiceForm.invoiceNumber || supplier?.name || "Nota"}` });
    setInvoiceForm({ status: "rascunho", entryDate: isoDate(new Date()), installments: 1 });
  };
  const submitInvoiceItem = (event) => {
    event.preventDefault();
    const invoice = getPurchaseInvoice(invoiceItemForm.invoiceId, purchaseInvoices);
    const ingredient = getIngredient(invoiceItemForm.ingredientId, ingredients);
    if (!invoice || !ingredient) return;
    const purchaseQty = numberValue(invoiceItemForm.purchaseQuantity);
    const conversion = numberValue(invoiceItemForm.conversionFactor) || unitConversionFactor(invoiceItemForm.purchaseUnit, ingredient.baseUnit);
    const stockQty = numberValue(invoiceItemForm.stockQuantity) || purchaseQty * conversion;
    const unitPrice = numberValue(invoiceItemForm.unitPrice);
    addPurchaseInvoiceItem({
      invoiceId: invoice.id,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      supplierProductCode: invoiceItemForm.supplierProductCode,
      supplierProductDescription: invoiceItemForm.supplierProductDescription || ingredient.name,
      ncm: invoiceItemForm.ncm,
      cfop: invoiceItemForm.cfop,
      purchaseQuantity: purchaseQty,
      purchaseUnit: invoiceItemForm.purchaseUnit,
      stockQuantity: stockQty,
      stockUnit: ingredient.baseUnit,
      unitPrice,
      discount: numberValue(invoiceItemForm.discount),
      totalPrice: numberValue(invoiceItemForm.totalPrice) || purchaseQty * unitPrice - numberValue(invoiceItemForm.discount),
      batchCode: invoiceItemForm.batchCode,
      expirationDate: invoiceItemForm.expirationDate,
    });
    setInvoiceItemForm({ invoiceId: invoiceItemForm.invoiceId, purchaseUnit: "un", stockUnit: "un", conversionFactor: 1 });
  };
  const postInvoice = (invoice) => {
    if (invoice.status === "lançada") return;
    const items = purchaseInvoiceItems.filter((item) => item.invoiceId === invoice.id);
    if (items.some((item) => !item.ingredientId)) {
      alert("Vincule todos os itens da nota aos ingredientes antes de lançar.");
      return;
    }
    items.forEach((item) => {
      const ingredient = ingredients.find((row) => row.id === item.ingredientId);
      if (!ingredient) return;
      const currentStock = numberValue(ingredient.currentStock);
      const currentCost = numberValue(ingredient.averageCost);
      const stockQty = numberValue(item.stockQuantity);
      const unitCost = stockQty ? numberValue(item.totalPrice) / stockQty : numberValue(item.unitPrice);
      const nextStock = currentStock + stockQty;
      const nextCost = nextStock > 0 ? ((currentStock * currentCost) + (stockQty * unitCost)) / nextStock : unitCost;
      updateItem("ingredients", ingredient.id, {
        currentStock: nextStock,
        averageCost: nextCost,
        expirationDate: item.expirationDate || ingredient.expirationDate,
      });
      addStockMovement({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        movementType: "entrada_nota",
        quantity: stockQty,
        unit: ingredient.baseUnit,
        unitCost,
        totalCost: numberValue(item.totalPrice),
        referenceType: "purchase_invoice",
        referenceId: invoice.id,
        reason: `Nota ${invoice.invoiceNumber || invoice.id}`,
        data: invoice.entryDate || isoDate(new Date()),
      });
    });
    const installments = Math.max(1, numberValue(invoice.installments) || 1);
    const amount = numberValue(invoice.invoiceTotal || invoice.productsTotal);
    if (amount > 0 && !accountsPayable.some((item) => item.invoiceId === invoice.id)) {
      Array.from({ length: installments }, (_, index) => {
        const dueDate = addDays(parseDate(invoice.entryDate || isoDate(new Date())), index * 30);
        addAccountPayable({
          invoiceId: invoice.id,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
          installmentNumber: index + 1,
          installmentLabel: `${index + 1}/${installments}`,
          amount: amount / installments,
          dueDate: isoDate(dueDate),
          status: "aberto",
          paymentMethod: invoice.paymentMethod,
        });
      });
    }
    updateItem("purchaseInvoices", invoice.id, { status: "lançada", postedAt: new Date().toISOString() });
  };
  const handleXmlUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseNfeXml(await file.text());
      setXmlImport({ status: "ready", message: `${parsed.items.length} itens lidos de ${file.name}.`, parsed });
    } catch (error) {
      setXmlImport({ status: "error", message: error.message || "Não foi possível ler o XML.", parsed: null });
    } finally {
      event.target.value = "";
    }
  };
  const createInvoiceFromXml = () => {
    const parsed = xmlImport.parsed;
    if (!parsed) return;
    const invoiceId = `NFE-${Date.now()}`;
    const alreadyExists = parsed.accessKey && purchaseInvoices.some((invoice) => invoice.accessKey === parsed.accessKey);
    if (alreadyExists) {
      setXmlImport({ ...xmlImport, status: "error", message: "Essa chave de acesso já existe em uma nota cadastrada." });
      return;
    }
    addPurchaseInvoice({
      id: invoiceId,
      supplierName: parsed.supplierName,
      supplierCnpj: parsed.supplierCnpj,
      invoiceNumber: parsed.invoiceNumber,
      invoiceSeries: parsed.invoiceSeries,
      accessKey: parsed.accessKey,
      issueDate: parsed.issueDate,
      entryDate: isoDate(new Date()),
      productsTotal: parsed.productsTotal,
      discountTotal: parsed.discountTotal,
      invoiceTotal: parsed.invoiceTotal,
      status: "rascunho",
      notes: "Importada de XML NF-e. Vincule os itens aos ingredientes antes de lançar.",
    });
    parsed.items.forEach((item) => {
      const mapping = findSupplierProductMapping(parsed, item, supplierProductMappings);
      const mappedIngredient = mapping ? ingredients.find((ingredient) => ingredient.id === mapping.ingredientId) : null;
      const stockUnit = mappedIngredient?.baseUnit || item.purchaseUnit;
      const conversionFactor = numberValue(mapping?.conversionFactor) || unitConversionFactor(item.purchaseUnit, stockUnit);
      addPurchaseInvoiceItem({
        invoiceId,
        supplierProductCode: item.supplierProductCode,
        supplierProductDescription: item.supplierProductDescription,
        ncm: item.ncm,
        cfop: item.cfop,
        purchaseQuantity: item.purchaseQuantity,
        purchaseUnit: item.purchaseUnit,
        stockQuantity: item.purchaseQuantity * conversionFactor,
        stockUnit,
        conversionFactor,
        unitPrice: item.unitPrice,
        discount: item.discount,
        totalPrice: item.totalPrice,
        ingredientId: mappedIngredient?.id || "",
        ingredientName: mappedIngredient?.name || "",
        needsLink: !mappedIngredient,
      });
    });
    setInvoiceItemForm({ ...invoiceItemForm, invoiceId: `${invoiceId} - ${parsed.invoiceNumber || parsed.supplierName || "XML"}` });
    setXmlImport({ status: "done", message: "Nota rascunho criada. Agora vincule os itens aos ingredientes antes de lançar.", parsed });
  };
  const linkInvoiceItem = (item, ingredientLabel) => {
    const ingredient = getIngredient(ingredientLabel, ingredients);
    if (!ingredient) return;
    const invoice = purchaseInvoices.find((row) => row.id === item.invoiceId);
    const conversionFactor = unitConversionFactor(item.purchaseUnit, ingredient.baseUnit);
    updateItem("purchaseInvoiceItems", item.id, {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      stockUnit: ingredient.baseUnit,
      conversionFactor,
      stockQuantity: numberValue(item.purchaseQuantity) * conversionFactor,
      needsLink: false,
    });
    const supplierKey = supplierMappingKey(invoice);
    const code = item.supplierProductCode || "";
    const description = item.supplierProductDescription || "";
    const alreadyMapped = supplierProductMappings.some((mapping) => (
      mapping.supplierKey === supplierKey
      && ((code && mapping.supplierProductCode === code) || (!code && normalizeKey(mapping.supplierProductDescription) === normalizeKey(description)))
    ));
    if (!alreadyMapped && addSupplierProductMapping) {
      addSupplierProductMapping({
        supplierKey,
        supplierName: invoice?.supplierName || "",
        supplierCnpj: invoice?.supplierCnpj || "",
        supplierProductCode: code,
        supplierProductDescription: description,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        purchaseUnit: item.purchaseUnit,
        stockUnit: ingredient.baseUnit,
        conversionFactor,
      });
    }
  };
  const updatePayableStatus = (item, status) => {
    if (status === "pago") {
      payAccountPayable(item);
      return;
    }
    updateItem("accountsPayable", item.id, { status, paidAt: status === "aberto" ? "" : item.paidAt });
  };
  const payAccountPayable = (item) => {
    if (item.status === "pago") return;
    const paidAt = isoDate(new Date());
    if (addFinanceiro && !item.financialPosted) {
      addFinanceiro("despesas", {
        data: paidAt,
        categoria: "Compras / estoque",
        nome: item.supplierName || item.supplierId || "Fornecedor",
        descricao: `Pagamento nota ${item.invoiceId || "-"} parcela ${item.installmentLabel || item.installmentNumber || "1/1"}`,
        valor: numberValue(item.amount),
        formaPagamento: item.paymentMethod || "",
        origem: "accounts_payable",
        referenceId: item.id,
      });
    }
    updateItem("accountsPayable", item.id, {
      status: "pago",
      paidAt,
      financialPosted: true,
    });
  };
  const copyPurchaseList = async () => {
    if (!purchasePlan.rows.length) {
      setPurchaseListMessage("Nenhum item sugerido para compra.");
      return;
    }
    try {
      await navigator.clipboard.writeText(purchaseListText);
      setPurchaseListMessage("Lista de compras copiada.");
    } catch {
      downloadText(`lista-compras-${isoDate(new Date())}.txt`, purchaseListText, "text/plain;charset=utf-8");
      setPurchaseListMessage("Não consegui copiar; baixei a lista em TXT.");
    }
  };
  const downloadPurchaseList = () => {
    downloadText(`lista-compras-${isoDate(new Date())}.txt`, purchaseListText || "Nenhuma compra sugerida.", "text/plain;charset=utf-8");
    setPurchaseListMessage("Lista de compras baixada.");
  };

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard"><span>Ingredientes</span><strong>{ingredients.length}</strong></article>
        <article className="kpiCard"><span>Produtos cardápio</span><strong>{menuProducts.length}</strong></article>
        <article className="kpiCard"><span>Fichas técnicas</span><strong>{new Set(recipeItems.map((item) => item.productId)).size}</strong></article>
        <article className="kpiCard"><span>Estoque baixo</span><strong className={kitchenAlerts.lowStock.length ? "negative" : ""}>{kitchenAlerts.lowStock.length}</strong></article>
        <article className="kpiCard"><span>CMV alto</span><strong className={kitchenAlerts.highCmv.length ? "negative" : ""}>{kitchenAlerts.highCmv.length}</strong></article>
        <article className="kpiCard"><span>Movimentos</span><strong>{stockMovements.length}</strong></article>
      </section>

      <div className="moduleTabs">
        <button className={stockView === "vendas" ? "active" : ""} onClick={() => setStockView("vendas")}>Vendas</button>
        <button className={stockView === "cardapio" ? "active" : ""} onClick={() => setStockView("cardapio")}>Cardápio</button>
        <button className={stockView === "estoque" ? "active" : ""} onClick={() => setStockView("estoque")}>Estoque</button>
        <button className={stockView === "notas" ? "active" : ""} onClick={() => setStockView("notas")}>Notas</button>
      </div>

      {stockView === "vendas" && (
      <FormPanel title="Lançar consumo de hóspede" onSubmit={submitSale} submitLabel="Salvar e baixar estoque" disabled={saleAvailability.blockers.length > 0}>
        <Input label="Data" type="date" value={saleForm.data} onChange={(dataValue) => setSaleForm({ ...saleForm, data: dataValue })} required />
        <Select label="Reserva" value={saleForm.reservaLabel} options={reservaOptions} onChange={selectReserva} />
        <Select label="Cabana" value={saleForm.cabana} options={data.listas.cabanas_full ?? data.listas.cabanas} onChange={(cabana) => setSaleForm({ ...saleForm, cabana })} required />
        <Input label="Hóspede / reserva" value={saleForm.hospede} onChange={(hospede) => setSaleForm({ ...saleForm, hospede })} />
        <Select label="Produto profissional" value={saleForm.productId} options={menuOptions} onChange={selectSaleProduct} />
        <Input label="Produto manual" value={saleForm.produto} onChange={(produto) => setSaleForm({ ...saleForm, produto })} />
        <Input label="Qtd." type="number" value={saleForm.quantidade} onChange={(quantidade) => setSaleForm({ ...saleForm, quantidade })} required />
        <Input label="Valor venda un." type="number" value={saleForm.valorVenda} onChange={(valorVenda) => setSaleForm({ ...saleForm, valorVenda })} />
        {[...saleAvailability.blockers, ...saleAvailability.warnings].map((issue) => <div className="formNotice" key={issue}>{issue}</div>)}
      </FormPanel>
      )}

      {stockView === "cardapio" && (
      <>
      <section className="contentGrid two">
        <FormPanel title="Ingrediente" onSubmit={submitIngredient} submitLabel="Salvar ingrediente">
          <Input label="Nome" value={ingredientForm.name} onChange={(name) => setIngredientForm({ ...ingredientForm, name })} required />
          <Input label="Categoria" value={ingredientForm.category} onChange={(category) => setIngredientForm({ ...ingredientForm, category })} />
          <Select label="Unidade base" value={ingredientForm.baseUnit} options={stockUnits} onChange={(baseUnit) => setIngredientForm({ ...ingredientForm, baseUnit })} />
          <Input label="Custo médio" type="number" value={ingredientForm.averageCost} onChange={(averageCost) => setIngredientForm({ ...ingredientForm, averageCost })} />
          <Input label="Estoque atual" type="number" value={ingredientForm.currentStock} onChange={(currentStock) => setIngredientForm({ ...ingredientForm, currentStock })} />
          <Input label="Estoque mínimo" type="number" value={ingredientForm.minimumStock} onChange={(minimumStock) => setIngredientForm({ ...ingredientForm, minimumStock })} />
          <Input label="Fornecedor padrão" value={ingredientForm.defaultSupplier} onChange={(defaultSupplier) => setIngredientForm({ ...ingredientForm, defaultSupplier })} />
          <Input label="Código interno" value={ingredientForm.internalCode} onChange={(internalCode) => setIngredientForm({ ...ingredientForm, internalCode })} />
          <Input label="Código de barras" value={ingredientForm.barcode} onChange={(barcode) => setIngredientForm({ ...ingredientForm, barcode })} />
          <Input label="Validade" type="date" value={ingredientForm.expirationDate} onChange={(expirationDate) => setIngredientForm({ ...ingredientForm, expirationDate })} />
          <Checkbox label="Ativo" checked={ingredientForm.active !== false} onChange={(active) => setIngredientForm({ ...ingredientForm, active })} />
        </FormPanel>

        <FormPanel title="Produto do cardápio" onSubmit={submitProduct} submitLabel="Salvar produto">
          <Input label="Nome" value={productForm.name} onChange={(name) => setProductForm({ ...productForm, name })} required />
          <Input label="Categoria" value={productForm.category} onChange={(category) => setProductForm({ ...productForm, category })} />
          <Input label="Descrição" value={productForm.description} onChange={(description) => setProductForm({ ...productForm, description })} />
          <Input label="Preço de venda" type="number" value={productForm.salePrice} onChange={(salePrice) => setProductForm({ ...productForm, salePrice })} />
          <Input label="Tempo preparo min." type="number" value={productForm.preparationTimeMinutes} onChange={(preparationTimeMinutes) => setProductForm({ ...productForm, preparationTimeMinutes })} />
          <Input label="Imagem URL" value={productForm.imageUrl} onChange={(imageUrl) => setProductForm({ ...productForm, imageUrl })} />
          <Input label="Obs. internas" value={productForm.internalNotes} onChange={(internalNotes) => setProductForm({ ...productForm, internalNotes })} />
          <Checkbox label="Ativo" checked={productForm.active !== false} onChange={(active) => setProductForm({ ...productForm, active })} />
          <Checkbox label="Venda individual" checked={productForm.allowIndividualSale !== false} onChange={(allowIndividualSale) => setProductForm({ ...productForm, allowIndividualSale })} />
        </FormPanel>
      </section>

      <section className="contentGrid two">
        <FormPanel title="Ficha técnica" onSubmit={submitRecipe} submitLabel="Adicionar ingrediente">
          <Select label="Produto" value={recipeForm.productId} options={menuOptions} onChange={(productId) => setRecipeForm({ ...recipeForm, productId })} />
          <Select label="Ingrediente" value={recipeForm.ingredientId} options={ingredientOptions} onChange={(ingredientId) => {
            const ingredient = getIngredient(ingredientId, ingredients);
            setRecipeForm({ ...recipeForm, ingredientId, unit: ingredient?.baseUnit || recipeForm.unit });
          }} />
          <Input label="Quantidade" type="number" value={recipeForm.quantity} onChange={(quantity) => setRecipeForm({ ...recipeForm, quantity })} />
          <Select label="Unidade usada" value={recipeForm.unit} options={stockUnits} onChange={(unit) => setRecipeForm({ ...recipeForm, unit })} />
          <Input label="Fator conversão" type="number" value={recipeForm.conversionFactor} onChange={(conversionFactor) => setRecipeForm({ ...recipeForm, conversionFactor })} />
          <Input label="Perda %" type="number" value={recipeForm.wastePercent} onChange={(wastePercent) => setRecipeForm({ ...recipeForm, wastePercent })} />
        </FormPanel>
        <Panel title="Resumo de custo">
          {recipeSummary ? (
            <div className="costSummary">
              <MetricLine label="Produto" value={recipeSummary.product.name} />
              <MetricLine label="Preço venda" value={formatCurrency(recipeSummary.salePrice)} />
              <MetricLine label="Custo ficha" value={formatCurrency(recipeSummary.costTotal)} />
              <MetricLine label="Lucro bruto" value={formatCurrency(recipeSummary.grossProfit)} />
              <MetricLine label="CMV" value={`${recipeSummary.cmvPercent.toFixed(2)}%`} />
              <MetricLine label="Margem" value={`${recipeSummary.marginPercent.toFixed(2)}%`} />
              <span className={recipeSummary.cmvPercent > 45 ? "status warn" : "status"}>{recipeSummary.cmvPercent > 45 ? "CMV alto" : "CMV saudável"}</span>
            </div>
          ) : <p className="muted">Cadastre um produto e sua ficha técnica.</p>}
        </Panel>
      </section>
      <Panel title="Composição da ficha técnica">
        <Table
          columns={["Ingrediente", "Uso na receita", "Uso em base", "Custo", "Peso no custo", ""]}
          rows={(recipeSummary?.items ?? []).map((item) => {
            const ingredient = ingredients.find((row) => row.id === item.ingredientId);
            const usedInBase = recipeQuantityInBase(item);
            const cost = recipeItemCost(item, ingredients);
            const costShare = recipeSummary.costTotal ? (cost / recipeSummary.costTotal) * 100 : 0;
            return [
              <div className="cellStack"><strong>{item.ingredientName || ingredient?.name || item.ingredientId}</strong><span>{ingredient?.category || ingredient?.internalCode || "-"}</span></div>,
              `${numberValue(item.quantity)} ${item.unit}`,
              `${usedInBase.toFixed(3)} ${ingredient?.baseUnit || ""}`,
              formatCurrency(cost),
              `${costShare.toFixed(1)}%`,
              <IconButton title="Excluir" onClick={() => secureRemove("recipeItems", item.id, removeItem, `ingrediente ${item.ingredientName || ingredient?.name || ""} da ficha`)} icon={Trash2} />,
            ];
          })}
          empty="Selecione um produto com ficha técnica ou adicione ingredientes à receita."
        />
      </Panel>
      <section className="kpiGrid">
        <article className="kpiCard"><span>Receita cardápio</span><strong>{formatCurrency(menuEngineering.revenueTotal)}</strong></article>
        <article className="kpiCard"><span>Lucro bruto</span><strong>{formatCurrency(menuEngineering.grossProfitTotal)}</strong></article>
        <article className="kpiCard"><span>CMV médio</span><strong className={menuEngineering.averageCmv > 45 ? "negative" : ""}>{menuEngineering.averageCmv.toFixed(2)}%</strong></article>
        <article className="kpiCard"><span>Revisar preço</span><strong className={menuEngineering.priceReview.length ? "negative" : ""}>{menuEngineering.priceReview.length}</strong></article>
        <article className="kpiCard"><span>Sem ficha</span><strong className={menuEngineering.noRecipe.length ? "negative" : ""}>{menuEngineering.noRecipe.length}</strong></article>
        <article className="kpiCard"><span>Produtos fortes</span><strong>{menuEngineering.strongProducts.length}</strong></article>
      </section>
      <section className="contentGrid two">
        <Panel title="Engenharia do cardápio">
          <Table
            columns={["Produto", "Venda", "Custo", "CMV", "Margem", "Preço alvo", "Diagnóstico"]}
            rows={menuEngineering.rows.map((item) => [
              <div className="cellStack"><strong>{item.name}</strong><span>{item.soldQuantity ? `${item.soldQuantity} vendido(s)` : item.category || "-"}</span></div>,
              formatCurrency(item.salePrice),
              formatCurrency(item.costTotal),
              `${item.cmvPercent.toFixed(2)}%`,
              `${item.marginPercent.toFixed(2)}%`,
              item.targetPrice ? formatCurrency(item.targetPrice) : "-",
              <span className={item.statusClass}>{item.diagnosis}</span>,
            ])}
            empty="Cadastre produtos do cardápio para analisar CMV e margem."
          />
        </Panel>
        <Panel title="Top lucro bruto">
          <SimpleBars rows={menuEngineering.topGrossProfit} valueKey="grossProfit" labelKey="name" />
        </Panel>
      </section>
      </>
      )}

      {stockView === "estoque" && (
      <>
      <section className="contentGrid two">
        <Panel title="Produtos e CMV">
          <Table
            columns={["Produto", "Venda", "Custo", "CMV", "Margem", "Status"]}
            rows={menuProducts.map((product) => {
              const summary = calculateRecipeSummary(product, ingredients, recipeItems);
              return [
                product.name,
                formatCurrency(summary.salePrice),
                formatCurrency(summary.costTotal),
                `${summary.cmvPercent.toFixed(2)}%`,
                `${summary.marginPercent.toFixed(2)}%`,
                <span className={summary.items.length ? summary.cmvPercent > 45 ? "status warn" : "status" : "status danger"}>{summary.items.length ? "Com ficha" : "Sem ficha"}</span>,
              ];
            })}
            empty="Nenhum produto profissional cadastrado."
          />
        </Panel>
        <Panel title="Ingredientes">
          <Table
            columns={["Ingrediente", "Atual", "Mínimo", "Custo médio", "Validade"]}
            rows={ingredients.map((item) => [
              <div className="cellStack"><strong>{item.name}</strong><span>{item.category || item.internalCode || "-"}</span></div>,
              `${numberValue(item.currentStock)} ${item.baseUnit}`,
              `${numberValue(item.minimumStock)} ${item.baseUnit}`,
              formatCurrency(item.averageCost),
              formatDate(item.expirationDate),
            ])}
            empty="Nenhum ingrediente cadastrado."
          />
        </Panel>
      </section>
      <section className="contentGrid two">
        <Panel title="Sugestão de compras">
          <div className="panelActions">
            <button className="smallButton" type="button" onClick={copyPurchaseList}>Copiar lista</button>
            <button className="smallButton mutedButton" type="button" onClick={downloadPurchaseList}>Baixar TXT</button>
          </div>
          {purchaseListMessage && <div className="okBox"><strong>Lista de compras</strong><span>{purchaseListMessage}</span></div>}
          <Table
            columns={["Ingrediente", "Atual", "Comprar", "Custo estimado", "Fornecedor"]}
            rows={purchasePlan.rows.map((item) => [
              <div className="cellStack"><strong>{item.name}</strong><span>{item.reason}</span></div>,
              `${item.currentStock} ${item.unit}`,
              `${item.suggestedQuantity} ${item.unit}`,
              formatCurrency(item.estimatedCost),
              item.supplier || "-",
            ])}
            empty="Nenhuma compra sugerida pelo estoque mínimo."
          />
        </Panel>
        <Panel title="Validade e lotes">
          <Table
            columns={["Ingrediente", "Lote", "Validade", "Nota", "Status"]}
            rows={stockLotAlerts.map((item) => [
              item.ingredientName || item.supplierProductDescription,
              item.batchCode || "-",
              formatDate(item.expirationDate),
              item.invoiceNumber || item.invoiceId,
              <span className={item.daysLeft < 0 ? "status danger" : item.daysLeft <= 7 ? "status warn" : "status"}>{item.label}</span>,
            ])}
            empty="Nenhum lote com validade próxima encontrado."
          />
        </Panel>
      </section>
      <Panel title="Pedido por fornecedor">
        <Table
          columns={["Fornecedor", "Itens", "Total estimado"]}
          rows={purchasePlan.groups.map((group) => [
            group.supplier,
            <div className="cellStack">{group.items.map((item) => <span key={item.id}>{item.name}: {item.suggestedQuantity} {item.unit}</span>)}</div>,
            formatCurrency(group.total),
          ])}
          empty="Nenhum pedido agrupado por fornecedor."
        />
      </Panel>
      <section className="kpiGrid">
        <article className="kpiCard"><span>Itens para comprar</span><strong className={purchasePlan.rows.length ? "negative" : ""}>{purchasePlan.rows.length}</strong></article>
        <article className="kpiCard"><span>Custo reposição</span><strong>{formatCurrency(purchasePlan.estimatedTotal)}</strong></article>
        <article className="kpiCard"><span>Lotes vencidos</span><strong className={stockLotAlerts.some((item) => item.daysLeft < 0) ? "negative" : ""}>{stockLotAlerts.filter((item) => item.daysLeft < 0).length}</strong></article>
        <article className="kpiCard"><span>Lotes 7 dias</span><strong className={stockLotAlerts.some((item) => item.daysLeft >= 0 && item.daysLeft <= 7) ? "negative" : ""}>{stockLotAlerts.filter((item) => item.daysLeft >= 0 && item.daysLeft <= 7).length}</strong></article>
      </section>
      </>
      )}

      {stockView === "estoque" && (
      <>
      <section className="contentGrid two">
        <FormPanel title="Ajuste / perda de estoque" onSubmit={submitMovement} submitLabel="Registrar movimento">
          <Select label="Ingrediente" value={movementForm.ingredientId} options={ingredientOptions} onChange={(ingredientId) => {
            const ingredient = getIngredient(ingredientId, ingredients);
            setMovementForm({ ...movementForm, ingredientId, unit: ingredient?.baseUnit || movementForm.unit });
          }} />
          <Select label="Tipo" value={movementForm.movementType} options={["ajuste_positivo", "ajuste_negativo", "perda", "vencimento", "consumo_interno"]} onChange={(movementType) => setMovementForm({ ...movementForm, movementType })} />
          <Input label="Quantidade" type="number" value={movementForm.quantity} onChange={(quantity) => setMovementForm({ ...movementForm, quantity })} />
          <Select label="Unidade" value={movementForm.unit} options={stockUnits} onChange={(unit) => setMovementForm({ ...movementForm, unit })} />
          <Input label="Data" type="date" value={movementForm.data} onChange={(dataValue) => setMovementForm({ ...movementForm, data: dataValue })} />
          <Input label="Motivo" value={movementForm.reason} onChange={(reason) => setMovementForm({ ...movementForm, reason })} />
        </FormPanel>
        <FormPanel title="Contagem de inventário" onSubmit={submitInventoryCount} submitLabel="Aplicar contagem">
          <Select label="Ingrediente" value={inventoryForm.ingredientId} options={ingredientOptions} onChange={(ingredientId) => {
            const ingredient = getIngredient(ingredientId, ingredients);
            setInventoryForm({ ...inventoryForm, ingredientId, unit: ingredient?.baseUnit || inventoryForm.unit });
          }} />
          <Input label="Qtd. contada" type="number" value={inventoryForm.countedQuantity} onChange={(countedQuantity) => setInventoryForm({ ...inventoryForm, countedQuantity })} />
          <Select label="Unidade contada" value={inventoryForm.unit} options={stockUnits} onChange={(unit) => setInventoryForm({ ...inventoryForm, unit })} />
          <Input label="Data" type="date" value={inventoryForm.data} onChange={(dataValue) => setInventoryForm({ ...inventoryForm, data: dataValue })} />
          <Input label="Observação" value={inventoryForm.reason} onChange={(reason) => setInventoryForm({ ...inventoryForm, reason })} />
          {inventoryIngredient && (
            <div className={inventoryDifference < 0 ? "alertBox" : "okBox"}>
              <strong>Diferença calculada</strong>
              <span>Sistema: {numberValue(inventoryIngredient.currentStock)} {inventoryIngredient.baseUnit} · Contado: {inventoryCountedBase} {inventoryIngredient.baseUnit} · Ajuste: {inventoryDifference} {inventoryIngredient.baseUnit}</span>
            </div>
          )}
        </FormPanel>
      </section>
      <section className="contentGrid two">
        <Panel title="Alertas profissionais">
          <div className="alertStack">
            {kitchenAlerts.all.length === 0 && <div className="okBox"><strong>Tudo certo</strong><span>Nenhum alerta crítico de cardápio ou estoque.</span></div>}
            {kitchenAlerts.all.map((alert) => <div className={alert.type === "danger" ? "alertBox" : "okBox"} key={alert.message}><strong>{alert.title}</strong><span>{alert.message}</span></div>)}
          </div>
        </Panel>
      </section>
      </>
      )}

      {stockView === "notas" && (
      <>
      <Panel title="Importar XML NF-e">
        <div className="xmlImportBox">
          <label className="fileImport">
            <span>Selecionar XML da NF-e</span>
            <input type="file" accept=".xml,text/xml,application/xml" onChange={handleXmlUpload} />
          </label>
          {xmlImport.message && (
            <div className={xmlImport.status === "error" ? "alertBox" : "okBox"}>
              <strong>{xmlImport.status === "error" ? "Atenção" : "XML lido"}</strong>
              <span>{xmlImport.message}</span>
            </div>
          )}
          {xmlImport.parsed && (
            <div className="xmlPreview">
              <MetricLine label="Fornecedor" value={xmlImport.parsed.supplierName || "-"} />
              <MetricLine label="CNPJ" value={xmlImport.parsed.supplierCnpj || "-"} />
              <MetricLine label="Nota" value={`${xmlImport.parsed.invoiceNumber || "-"} / Série ${xmlImport.parsed.invoiceSeries || "-"}`} />
              <MetricLine label="Emissão" value={formatDate(xmlImport.parsed.issueDate)} />
              <MetricLine label="Total" value={formatCurrency(xmlImport.parsed.invoiceTotal)} />
              <MetricLine label="Itens" value={xmlImport.parsed.items.length} />
              <button className="primaryButton" type="button" onClick={createInvoiceFromXml}>Criar nota rascunho</button>
            </div>
          )}
        </div>
      </Panel>
      <section className="kpiGrid">
        <article className="kpiCard"><span>Aberto em notas</span><strong>{formatCurrency(payableSummary.openTotal)}</strong></article>
        <article className="kpiCard"><span>Parcelas abertas</span><strong>{payableSummary.openCount}</strong></article>
        <article className="kpiCard"><span>Vencidas</span><strong className={payableSummary.overdueCount ? "negative" : ""}>{payableSummary.overdueCount}</strong></article>
        <article className="kpiCard"><span>Vence em 7 dias</span><strong className={payableSummary.dueSoonCount ? "negative" : ""}>{payableSummary.dueSoonCount}</strong></article>
        <article className="kpiCard"><span>Pago em notas</span><strong>{formatCurrency(payableSummary.paidTotal)}</strong></article>
        <article className="kpiCard"><span>Cancelado</span><strong>{formatCurrency(payableSummary.cancelledTotal)}</strong></article>
      </section>
      {payableSummary.alerts.length > 0 && (
        <Panel title="Alertas de contas das notas">
          <div className="alertStack">
            {payableSummary.alerts.map((alert) => (
              <div className={alert.type === "danger" ? "alertBox" : "okBox"} key={alert.message}>
                <strong>{alert.title}</strong>
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <section className="contentGrid two">
        <FormPanel title="Fornecedor" onSubmit={submitSupplier} submitLabel="Salvar fornecedor">
          <Input label="Nome" value={supplierForm.name} onChange={(name) => setSupplierForm({ ...supplierForm, name })} required />
          <Input label="CNPJ" value={supplierForm.cnpj} onChange={(cnpj) => setSupplierForm({ ...supplierForm, cnpj })} />
          <Input label="Telefone" value={supplierForm.phone} onChange={(phone) => setSupplierForm({ ...supplierForm, phone })} />
          <Input label="E-mail" type="email" value={supplierForm.email} onChange={(email) => setSupplierForm({ ...supplierForm, email })} />
          <Input label="Endereço" value={supplierForm.address} onChange={(address) => setSupplierForm({ ...supplierForm, address })} />
          <Checkbox label="Ativo" checked={supplierForm.active !== false} onChange={(active) => setSupplierForm({ ...supplierForm, active })} />
        </FormPanel>

        <FormPanel title="Entrada de nota manual" onSubmit={submitInvoice} submitLabel="Criar nota">
          <Select label="Fornecedor" value={invoiceForm.supplierId} options={supplierOptions} onChange={(supplierId) => setInvoiceForm({ ...invoiceForm, supplierId })} />
          <Input label="Fornecedor avulso" value={invoiceForm.supplierName} onChange={(supplierName) => setInvoiceForm({ ...invoiceForm, supplierName })} />
          <Input label="Número da nota" value={invoiceForm.invoiceNumber} onChange={(invoiceNumber) => setInvoiceForm({ ...invoiceForm, invoiceNumber })} />
          <Input label="Série" value={invoiceForm.invoiceSeries} onChange={(invoiceSeries) => setInvoiceForm({ ...invoiceForm, invoiceSeries })} />
          <Input label="Chave de acesso" value={invoiceForm.accessKey} onChange={(accessKey) => setInvoiceForm({ ...invoiceForm, accessKey })} />
          <Input label="Emissão" type="date" value={invoiceForm.issueDate} onChange={(issueDate) => setInvoiceForm({ ...invoiceForm, issueDate })} />
          <Input label="Entrada" type="date" value={invoiceForm.entryDate} onChange={(entryDate) => setInvoiceForm({ ...invoiceForm, entryDate })} />
          <Input label="Valor produtos" type="number" value={invoiceForm.productsTotal} onChange={(productsTotal) => setInvoiceForm({ ...invoiceForm, productsTotal, invoiceTotal: invoiceForm.invoiceTotal || productsTotal })} />
          <Input label="Frete" type="number" value={invoiceForm.freightTotal} onChange={(freightTotal) => setInvoiceForm({ ...invoiceForm, freightTotal })} />
          <Input label="Desconto" type="number" value={invoiceForm.discountTotal} onChange={(discountTotal) => setInvoiceForm({ ...invoiceForm, discountTotal })} />
          <Input label="Total nota" type="number" value={invoiceForm.invoiceTotal} onChange={(invoiceTotal) => setInvoiceForm({ ...invoiceForm, invoiceTotal })} />
          <Select label="Forma pagamento" value={invoiceForm.paymentMethod} options={data.listas.formas_pgto} onChange={(paymentMethod) => setInvoiceForm({ ...invoiceForm, paymentMethod })} />
          <Input label="Parcelas" type="number" value={invoiceForm.installments} onChange={(installments) => setInvoiceForm({ ...invoiceForm, installments })} />
        </FormPanel>
      </section>

      <section className="contentGrid two">
        <FormPanel title="Item da nota" onSubmit={submitInvoiceItem} submitLabel="Adicionar item">
          <Select label="Nota" value={invoiceItemForm.invoiceId} options={invoiceOptions} onChange={(invoiceId) => setInvoiceItemForm({ ...invoiceItemForm, invoiceId })} />
          <Select label="Ingrediente vinculado" value={invoiceItemForm.ingredientId} options={ingredientOptions} onChange={(ingredientId) => {
            const ingredient = getIngredient(ingredientId, ingredients);
            setInvoiceItemForm({ ...invoiceItemForm, ingredientId, stockUnit: ingredient?.baseUnit || invoiceItemForm.stockUnit });
          }} />
          <Input label="Descrição fornecedor" value={invoiceItemForm.supplierProductDescription} onChange={(supplierProductDescription) => setInvoiceItemForm({ ...invoiceItemForm, supplierProductDescription })} />
          <Input label="Código fornecedor" value={invoiceItemForm.supplierProductCode} onChange={(supplierProductCode) => setInvoiceItemForm({ ...invoiceItemForm, supplierProductCode })} />
          <Input label="NCM" value={invoiceItemForm.ncm} onChange={(ncm) => setInvoiceItemForm({ ...invoiceItemForm, ncm })} />
          <Input label="CFOP" value={invoiceItemForm.cfop} onChange={(cfop) => setInvoiceItemForm({ ...invoiceItemForm, cfop })} />
          <Input label="Qtd. compra" type="number" value={invoiceItemForm.purchaseQuantity} onChange={(purchaseQuantity) => setInvoiceItemForm({ ...invoiceItemForm, purchaseQuantity })} />
          <Select label="Unidade compra" value={invoiceItemForm.purchaseUnit} options={stockUnits} onChange={(purchaseUnit) => setInvoiceItemForm({ ...invoiceItemForm, purchaseUnit })} />
          <Input label="Fator conversão" type="number" value={invoiceItemForm.conversionFactor} onChange={(conversionFactor) => setInvoiceItemForm({ ...invoiceItemForm, conversionFactor })} />
          <Input label="Qtd. estoque" type="number" value={invoiceItemForm.stockQuantity} onChange={(stockQuantity) => setInvoiceItemForm({ ...invoiceItemForm, stockQuantity })} />
          <Input label="Valor unitário" type="number" value={invoiceItemForm.unitPrice} onChange={(unitPrice) => setInvoiceItemForm({ ...invoiceItemForm, unitPrice })} />
          <Input label="Desconto" type="number" value={invoiceItemForm.discount} onChange={(discount) => setInvoiceItemForm({ ...invoiceItemForm, discount })} />
          <Input label="Total item" type="number" value={invoiceItemForm.totalPrice} onChange={(totalPrice) => setInvoiceItemForm({ ...invoiceItemForm, totalPrice })} />
          <Input label="Lote" value={invoiceItemForm.batchCode} onChange={(batchCode) => setInvoiceItemForm({ ...invoiceItemForm, batchCode })} />
          <Input label="Validade" type="date" value={invoiceItemForm.expirationDate} onChange={(expirationDate) => setInvoiceItemForm({ ...invoiceItemForm, expirationDate })} />
        </FormPanel>

        <Panel title="Notas de compra">
          <Table
            columns={["Nota", "Fornecedor", "Entrada", "Total", "Status", "Itens", "Ações"]}
            rows={purchaseInvoices.map((invoice) => {
              const items = purchaseInvoiceItems.filter((item) => item.invoiceId === invoice.id);
              return [
                invoice.invoiceNumber || invoice.id,
                invoice.supplierName || "-",
                formatDate(invoice.entryDate),
                formatCurrency(invoice.invoiceTotal || invoice.productsTotal),
                <span className={invoice.status === "lançada" ? "status" : invoice.status === "cancelada" ? "status danger" : "status warn"}>{invoice.status || "rascunho"}</span>,
                items.length,
                <div className="rowActions">
                  <button className="smallButton" disabled={invoice.status === "lançada" || !canAction("estoque", "lancar")} onClick={() => postInvoice(invoice)}>Lançar</button>
                  <button className="smallButton mutedButton" disabled={!canAction("estoque", "editar")} onClick={() => updateItem("purchaseInvoices", invoice.id, { status: "cancelada" })}>Cancelar</button>
                </div>,
              ];
            })}
            empty="Nenhuma nota cadastrada."
          />
        </Panel>
      </section>
      <Panel title="Fornecedores de compra">
        <Table
          columns={["Fornecedor", "Notas", "Comprado", "Em aberto", "Última compra", "Itens sem vínculo", "Status"]}
          rows={supplierPurchaseSummary.map((item) => [
            <div className="cellStack"><strong>{item.supplierName}</strong><span>{item.supplierKey || "-"}</span></div>,
            item.invoiceCount,
            formatCurrency(item.purchasedTotal),
            formatCurrency(item.openTotal),
            formatDate(item.lastPurchaseDate),
            item.unlinkedItems,
            <span className={item.unlinkedItems ? "status warn" : item.openTotal > 0 ? "status neutral" : "status"}>{item.unlinkedItems ? "Mapear produtos" : item.openTotal > 0 ? "Com pendência" : "Ok"}</span>,
          ])}
          empty="Nenhum fornecedor com notas cadastradas."
        />
      </Panel>

      <section className="contentGrid two">
        <Panel title="Itens de notas">
          <Table
            columns={["Nota", "Produto fornecedor", "Vincular ingrediente", "Compra", "Estoque entra", "Total", "Status"]}
            rows={purchaseInvoiceItems.map((item) => [
              item.invoiceId,
              item.supplierProductDescription || item.ingredientName,
              <InlineSelect value={item.ingredientId ? `${item.ingredientId} - ${item.ingredientName}` : ""} options={ingredientOptions} onChange={(value) => linkInvoiceItem(item, value)} />,
              `${numberValue(item.purchaseQuantity)} ${item.purchaseUnit}`,
              `${numberValue(item.stockQuantity)} ${item.stockUnit}`,
              formatCurrency(item.totalPrice),
              <span className={item.ingredientId ? "status" : "status warn"}>{item.ingredientId ? "Vinculado" : "Vincular"}</span>,
            ])}
            empty="Nenhum item de nota cadastrado."
          />
        </Panel>
        <Panel title="Contas a pagar geradas">
          <Table
            columns={["Fornecedor", "Parcela", "Vencimento", "Valor", "Pago em", "Status", "Ações"]}
            rows={payableRows.map((item) => [
              item.supplierName || item.supplierId || "-",
              item.installmentLabel || item.installmentNumber,
              formatDate(item.dueDate),
              formatCurrency(item.amount),
              formatDate(item.paidAt),
              <InlineSelect value={payableAutoStatus(item)} options={["aberto", "pago", "vencido", "cancelado"]} onChange={(status) => updatePayableStatus(item, status)} />,
              <div className="rowActions">
                <button className="smallButton" disabled={item.status === "pago" || item.status === "cancelado" || !canAction("estoque", "lancar")} onClick={() => payAccountPayable(item)}>Pagar</button>
                <button className="smallButton mutedButton" disabled={item.status === "cancelado" || !canAction("estoque", "editar")} onClick={() => updatePayableStatus(item, "cancelado")}>Cancelar</button>
              </div>,
            ])}
            empty="Nenhuma conta a pagar gerada."
          />
        </Panel>
      </section>
      </>
      )}

      {(stockView === "estoque" || stockView === "vendas") && (
      <section className="contentGrid two">
        <Panel title="Movimentações de estoque">
          <Table
            columns={["Data", "Tipo", "Ingrediente", "Qtd.", "Custo", "Motivo"]}
            rows={stockMovements.slice(0, 80).map((item) => [
              formatDate(item.data || item.createdAt),
              item.movementType,
              item.ingredientName || item.ingredientId,
              `${numberValue(item.quantity)} ${item.unit || ""}`,
              formatCurrency(item.totalCost),
              item.reason || "-",
            ])}
            empty="Nenhuma movimentação registrada."
          />
        </Panel>
        <Panel title="Consumos lançados">
          <Table
            columns={["Data", "Reserva", "Cabana", "Produto", "Qtd.", "Venda", ""]}
            rows={data.consumos.map((item) => [
              formatDate(item.data),
              item.reservaId || "-",
              item.cabana,
              item.produto,
              item.quantidade,
              formatCurrency(consumptionTotal(item)),
              <IconButton title="Excluir" onClick={() => secureRemove("consumos", item.id, removeItem, `consumo ${item.produto || ""}`)} icon={Trash2} />,
            ])}
            empty="Nenhum consumo lançado."
          />
        </Panel>
      </section>
      )}
    </div>
  );
}

function getMenuProduct(idOrLabel, products = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return products.find((product) => product.id === clean);
}

function getIngredient(idOrLabel, ingredients = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return ingredients.find((ingredient) => ingredient.id === clean);
}

function getSupplier(idOrLabel, suppliers = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return suppliers.find((supplier) => supplier.id === clean);
}

function getPurchaseInvoice(idOrLabel, invoices = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return invoices.find((invoice) => invoice.id === clean);
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function supplierMappingKey(source) {
  return normalizeKey(source?.supplierCnpj || source?.supplierId || source?.supplierName || "");
}

function findSupplierProductMapping(invoice, item, mappings = []) {
  const supplierKey = supplierMappingKey(invoice);
  const code = String(item?.supplierProductCode ?? "");
  const descriptionKey = normalizeKey(item?.supplierProductDescription);
  return mappings.find((mapping) => (
    mapping.supplierKey === supplierKey
    && code
    && mapping.supplierProductCode === code
  )) || mappings.find((mapping) => (
    mapping.supplierKey === supplierKey
    && normalizeKey(mapping.supplierProductDescription) === descriptionKey
  ));
}

function parseNfeXml(xmlText) {
  const documentXml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (documentXml.querySelector("parsererror")) {
    throw new Error("XML inválido.");
  }
  const read = (node, tag) => node?.getElementsByTagName(tag)?.[0]?.textContent?.trim() || "";
  const root = documentXml;
  const infNFe = root.getElementsByTagName("infNFe")[0];
  const emit = root.getElementsByTagName("emit")[0];
  const total = root.getElementsByTagName("ICMSTot")[0];
  const issueRaw = read(root, "dhEmi") || read(root, "dEmi");
  const accessKey = read(root, "chNFe") || infNFe?.getAttribute("Id")?.replace(/^NFe/, "") || "";
  const items = Array.from(root.getElementsByTagName("det")).map((det) => {
    const prod = det.getElementsByTagName("prod")[0];
    return {
      supplierProductCode: read(prod, "cProd"),
      supplierProductDescription: read(prod, "xProd"),
      ncm: read(prod, "NCM"),
      cfop: read(prod, "CFOP"),
      purchaseQuantity: numberValue(read(prod, "qCom")),
      purchaseUnit: normalizeXmlUnit(read(prod, "uCom")),
      unitPrice: numberValue(read(prod, "vUnCom")),
      discount: numberValue(read(prod, "vDesc")),
      totalPrice: numberValue(read(prod, "vProd")) - numberValue(read(prod, "vDesc")),
    };
  }).filter((item) => item.supplierProductDescription);

  if (!items.length) throw new Error("Não encontrei itens de produto no XML.");
  return {
    supplierName: read(emit, "xNome"),
    supplierCnpj: read(emit, "CNPJ") || read(emit, "CPF"),
    invoiceNumber: read(root, "nNF"),
    invoiceSeries: read(root, "serie"),
    accessKey,
    issueDate: issueRaw ? issueRaw.slice(0, 10) : "",
    productsTotal: numberValue(read(total, "vProd")),
    discountTotal: numberValue(read(total, "vDesc")),
    invoiceTotal: numberValue(read(total, "vNF")),
    items,
  };
}

function normalizeXmlUnit(unit = "") {
  const clean = String(unit).trim().toLowerCase();
  if (["un", "und", "unid", "unidade"].includes(clean)) return "un";
  if (["kg", "quilo"].includes(clean)) return "kg";
  if (["g", "gr"].includes(clean)) return "g";
  if (["lt", "l"].includes(clean)) return "l";
  if (["ml"].includes(clean)) return "ml";
  if (["cx", "caixa"].includes(clean)) return "caixa";
  if (["pc", "pct", "pacote"].includes(clean)) return "pacote";
  return clean || "un";
}

function recipeQuantityInBase(item) {
  return numberValue(item.quantity) * (numberValue(item.conversionFactor) || 1) * (1 + numberValue(item.wastePercent) / 100);
}

function recipeItemCost(item, ingredients = []) {
  const ingredient = ingredients.find((row) => row.id === item.ingredientId);
  return recipeQuantityInBase(item) * numberValue(ingredient?.averageCost ?? item.unitCostSnapshot);
}

function calculateRecipeSummary(product, ingredients = [], recipeItems = []) {
  const items = recipeItems.filter((item) => item.productId === product.id);
  const costTotal = items.reduce((total, item) => total + recipeItemCost(item, ingredients), 0);
  const salePrice = numberValue(product.salePrice);
  const grossProfit = salePrice - costTotal;
  return {
    product,
    items,
    salePrice,
    costTotal,
    grossProfit,
    cmvPercent: salePrice ? (costTotal / salePrice) * 100 : 0,
    marginPercent: salePrice ? (grossProfit / salePrice) * 100 : 0,
  };
}

function buildMenuEngineering(products = [], ingredients = [], recipeItems = [], consumos = []) {
  const rows = products.map((product) => {
    const summary = calculateRecipeSummary(product, ingredients, recipeItems);
    const sales = consumos.filter((item) => item.productId === product.id);
    const soldQuantity = sales.reduce((total, item) => total + numberValue(item.quantidade), 0);
    const revenue = sales.reduce((total, item) => total + consumptionTotal(item), 0);
    const grossProfitFromSales = sales.reduce((total, item) => total + (numberValue(item.valorVenda) - summary.costTotal) * numberValue(item.quantidade), 0);
    const targetPrice = summary.costTotal > 0 ? summary.costTotal / 0.35 : 0;
    let diagnosis = "CMV saudável";
    let statusClass = "status";
    if (!summary.items.length) {
      diagnosis = "Sem ficha";
      statusClass = "status danger";
    } else if (summary.cmvPercent > 45) {
      diagnosis = "Revisar preço";
      statusClass = "status warn";
    } else if (summary.marginPercent >= 60) {
      diagnosis = "Produto forte";
    }
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      salePrice: summary.salePrice,
      costTotal: summary.costTotal,
      grossProfit: summary.grossProfit,
      grossProfitFromSales,
      cmvPercent: summary.cmvPercent,
      marginPercent: summary.marginPercent,
      targetPrice,
      hasRecipe: summary.items.length > 0,
      soldQuantity,
      revenue,
      diagnosis,
      statusClass,
    };
  }).sort((a, b) => b.grossProfit - a.grossProfit);
  const withRecipe = rows.filter((item) => item.hasRecipe && item.salePrice > 0);
  const revenueTotal = rows.reduce((total, item) => total + item.revenue, 0);
  return {
    rows,
    revenueTotal,
    grossProfitTotal: rows.reduce((total, item) => total + item.grossProfitFromSales, 0),
    averageCmv: withRecipe.length ? withRecipe.reduce((total, item) => total + item.cmvPercent, 0) / withRecipe.length : 0,
    priceReview: rows.filter((item) => item.hasRecipe && item.cmvPercent > 45),
    noRecipe: rows.filter((item) => !item.hasRecipe),
    strongProducts: rows.filter((item) => item.hasRecipe && item.marginPercent >= 60),
    topGrossProfit: rows.filter((item) => item.grossProfit > 0).slice(0, 6),
  };
}

function checkProductAvailability(productId, quantity, ingredients = [], recipeItems = []) {
  const blockers = [];
  const warnings = [];
  const items = recipeItems.filter((item) => item.productId === productId);
  if (!items.length) {
    warnings.push("Produto sem ficha técnica. O estoque não será baixado automaticamente.");
    return { blockers, warnings };
  }
  items.forEach((item) => {
    const ingredient = ingredients.find((row) => row.id === item.ingredientId);
    if (!ingredient) {
      blockers.push(`Ingrediente não encontrado na ficha: ${item.ingredientName || item.ingredientId}.`);
      return;
    }
    const needed = recipeQuantityInBase(item) * quantity;
    if (numberValue(ingredient.currentStock) < needed) {
      blockers.push(`Produto indisponível: falta ${ingredient.name}. Estoque atual: ${numberValue(ingredient.currentStock)}${ingredient.baseUnit}. Necessário: ${needed}${ingredient.baseUnit}.`);
    }
  });
  return { blockers, warnings };
}

function unitConversionFactor(from, to) {
  if (!from || !to || from === to) return 1;
  if (from === "kg" && to === "g") return 1000;
  if (from === "g" && to === "kg") return 0.001;
  if (from === "l" && to === "ml") return 1000;
  if (from === "ml" && to === "l") return 0.001;
  return 1;
}

function payableAutoStatus(item) {
  if (item.status === "pago" || item.status === "cancelado") return item.status;
  const due = parseDate(item.dueDate);
  const today = parseDate(isoDate(new Date()));
  return !Number.isNaN(due.getTime()) && due < today ? "vencido" : (item.status || "aberto");
}

function sortAccountsPayable(rows = []) {
  const statusWeight = { vencido: 0, aberto: 1, pago: 2, cancelado: 3 };
  return [...rows].sort((a, b) => {
    const statusA = payableAutoStatus(a);
    const statusB = payableAutoStatus(b);
    if (statusWeight[statusA] !== statusWeight[statusB]) return statusWeight[statusA] - statusWeight[statusB];
    return parseDate(a.dueDate) - parseDate(b.dueDate);
  });
}

function buildAccountsPayableSummary(rows = []) {
  const today = parseDate(isoDate(new Date()));
  const dueLimit = addDays(today, 7);
  const active = rows.filter((item) => !["pago", "cancelado"].includes(item.status));
  const paid = rows.filter((item) => item.status === "pago");
  const cancelled = rows.filter((item) => item.status === "cancelado");
  const overdue = active.filter((item) => {
    const due = parseDate(item.dueDate);
    return !Number.isNaN(due.getTime()) && due < today;
  });
  const dueSoon = active.filter((item) => {
    const due = parseDate(item.dueDate);
    return !Number.isNaN(due.getTime()) && today <= due && due <= dueLimit;
  });
  const openTotal = active.reduce((total, item) => total + numberValue(item.amount), 0);
  const alerts = [
    ...overdue.slice(0, 5).map((item) => ({
      type: "danger",
      title: "Conta vencida",
      message: `${item.supplierName || "Fornecedor"}: ${formatCurrency(item.amount)} venceu em ${formatDate(item.dueDate)}.`,
    })),
    ...dueSoon.slice(0, 5).map((item) => ({
      type: "warn",
      title: "Vencimento próximo",
      message: `${item.supplierName || "Fornecedor"}: ${formatCurrency(item.amount)} vence em ${formatDate(item.dueDate)}.`,
    })),
  ];
  return {
    openCount: active.length,
    openTotal,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    paidTotal: paid.reduce((total, item) => total + numberValue(item.amount), 0),
    cancelledTotal: cancelled.reduce((total, item) => total + numberValue(item.amount), 0),
    alerts,
  };
}

function movementSign(type) {
  return ["ajuste_negativo", "perda", "vencimento", "consumo_interno", "saida_venda"].includes(type) ? -1 : 1;
}

function buildKitchenAlerts(ingredients = [], products = [], recipeItems = []) {
  const lowStock = ingredients.filter((item) => numberValue(item.currentStock) <= numberValue(item.minimumStock) && numberValue(item.minimumStock) > 0);
  const noCost = ingredients.filter((item) => numberValue(item.averageCost) <= 0);
  const noRecipe = products.filter((product) => !recipeItems.some((item) => item.productId === product.id));
  const highCmv = products
    .map((product) => calculateRecipeSummary(product, ingredients, recipeItems))
    .filter((summary) => summary.items.length > 0 && summary.cmvPercent > 45);
  const nearExpiration = ingredients.filter((item) => {
    const date = parseDate(item.expirationDate);
    if (!item.expirationDate || Number.isNaN(date.getTime())) return false;
    return (date - new Date()) / 86400000 <= 7;
  });
  const all = [
    ...lowStock.map((item) => ({ type: "danger", title: "Estoque baixo", message: `${item.name}: atual ${numberValue(item.currentStock)}${item.baseUnit}, mínimo ${numberValue(item.minimumStock)}${item.baseUnit}.` })),
    ...noCost.map((item) => ({ type: "danger", title: "Sem custo", message: `${item.name} não possui custo médio cadastrado.` })),
    ...noRecipe.map((item) => ({ type: "danger", title: "Produto sem ficha", message: `${item.name} pode ser vendido sem baixa automática de estoque.` })),
    ...highCmv.map((summary) => ({ type: "warn", title: "CMV alto", message: `${summary.product.name}: CMV ${summary.cmvPercent.toFixed(2)}%.` })),
    ...nearExpiration.map((item) => ({ type: "warn", title: "Validade próxima", message: `${item.name} vence em ${formatDate(item.expirationDate)}.` })),
  ];
  return { lowStock, noCost, noRecipe, highCmv, nearExpiration, all };
}

function buildPurchasePlan(ingredients = [], purchaseItems = [], invoices = []) {
  const invoiceById = Object.fromEntries(invoices.map((invoice) => [invoice.id, invoice]));
  const rows = ingredients
    .filter((ingredient) => ingredient.active !== false && numberValue(ingredient.minimumStock) > 0)
    .map((ingredient) => {
      const currentStock = numberValue(ingredient.currentStock);
      const minimumStock = numberValue(ingredient.minimumStock);
      const targetStock = minimumStock * 2;
      const suggestedQuantity = Math.max(0, targetStock - currentStock);
      const lastPurchase = purchaseItems
        .filter((item) => item.ingredientId === ingredient.id)
        .map((item) => ({ item, invoice: invoiceById[item.invoiceId] }))
        .sort((a, b) => parseDate(b.invoice?.entryDate || b.item.createdAt) - parseDate(a.invoice?.entryDate || a.item.createdAt))[0];
      return {
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.baseUnit,
        currentStock,
        minimumStock,
        suggestedQuantity,
        estimatedCost: suggestedQuantity * numberValue(ingredient.averageCost),
        supplier: ingredient.defaultSupplier || lastPurchase?.invoice?.supplierName || "",
        reason: `mín. ${minimumStock} ${ingredient.baseUnit}`,
      };
    })
    .filter((item) => item.currentStock <= item.minimumStock && item.suggestedQuantity > 0)
    .sort((a, b) => (a.currentStock / a.minimumStock) - (b.currentStock / b.minimumStock));
  const groups = Object.values(rows.reduce((acc, item) => {
    const supplier = item.supplier || "Sem fornecedor";
    acc[supplier] ??= { supplier, items: [], total: 0 };
    acc[supplier].items.push(item);
    acc[supplier].total += item.estimatedCost;
    return acc;
  }, {})).sort((a, b) => a.supplier.localeCompare(b.supplier));
  return {
    rows,
    groups,
    estimatedTotal: rows.reduce((total, item) => total + item.estimatedCost, 0),
  };
}

function buildPurchaseListText(plan) {
  if (!plan?.rows?.length) return "";
  const lines = [
    `Lista de compras - Rancho das Neves`,
    `Gerada em ${formatDate(isoDate(new Date()))}`,
    `Total estimado: ${formatCurrency(plan.estimatedTotal)}`,
    "",
  ];
  plan.groups.forEach((group) => {
    lines.push(group.supplier);
    group.items.forEach((item) => {
      lines.push(`- ${item.name}: comprar ${item.suggestedQuantity} ${item.unit} | atual ${item.currentStock} ${item.unit} | estimado ${formatCurrency(item.estimatedCost)}`);
    });
    lines.push(`Subtotal: ${formatCurrency(group.total)}`, "");
  });
  return lines.join("\n");
}

function buildStockLotAlerts(purchaseItems = [], invoices = []) {
  const invoiceById = Object.fromEntries(invoices.map((invoice) => [invoice.id, invoice]));
  const today = parseDate(isoDate(new Date()));
  const limit = addDays(today, 30);
  return purchaseItems
    .filter((item) => item.expirationDate && item.ingredientId)
    .map((item) => {
      const expiration = parseDate(item.expirationDate);
      const daysLeft = Number.isNaN(expiration.getTime()) ? 9999 : Math.ceil((expiration - today) / 86400000);
      const invoice = invoiceById[item.invoiceId];
      return {
        ...item,
        invoiceNumber: invoice?.invoiceNumber,
        daysLeft,
        label: daysLeft < 0 ? `Vencido há ${Math.abs(daysLeft)} dia(s)` : `${daysLeft} dia(s)`,
      };
    })
    .filter((item) => item.daysLeft <= 30 || parseDate(item.expirationDate) <= limit)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 30);
}

function buildSupplierPurchaseSummary(invoices = [], purchaseItems = [], accountsPayable = []) {
  const invoiceById = Object.fromEntries(invoices.map((invoice) => [invoice.id, invoice]));
  const rows = invoices.reduce((acc, invoice) => {
    const supplierKey = supplierMappingKey(invoice) || invoice.id;
    const supplierName = invoice.supplierName || "Fornecedor sem nome";
    acc[supplierKey] ??= {
      supplierKey,
      supplierName,
      invoiceCount: 0,
      purchasedTotal: 0,
      openTotal: 0,
      lastPurchaseDate: "",
      unlinkedItems: 0,
    };
    const row = acc[supplierKey];
    row.invoiceCount += 1;
    row.purchasedTotal += numberValue(invoice.invoiceTotal || invoice.productsTotal);
    const entryDate = invoice.entryDate || invoice.issueDate;
    if (!row.lastPurchaseDate || parseDate(entryDate) > parseDate(row.lastPurchaseDate)) {
      row.lastPurchaseDate = entryDate;
    }
    return acc;
  }, {});
  accountsPayable
    .filter((item) => !["pago", "cancelado"].includes(item.status))
    .forEach((item) => {
      const invoice = invoiceById[item.invoiceId];
      const supplierKey = supplierMappingKey(invoice) || normalizeKey(item.supplierId || item.supplierName || item.invoiceId);
      rows[supplierKey] ??= {
        supplierKey,
        supplierName: item.supplierName || invoice?.supplierName || "Fornecedor sem nome",
        invoiceCount: 0,
        purchasedTotal: 0,
        openTotal: 0,
        lastPurchaseDate: invoice?.entryDate || "",
        unlinkedItems: 0,
      };
      rows[supplierKey].openTotal += numberValue(item.amount);
    });
  purchaseItems
    .filter((item) => !item.ingredientId)
    .forEach((item) => {
      const invoice = invoiceById[item.invoiceId];
      const supplierKey = supplierMappingKey(invoice) || item.invoiceId;
      rows[supplierKey] ??= {
        supplierKey,
        supplierName: invoice?.supplierName || "Fornecedor sem nome",
        invoiceCount: invoice ? 1 : 0,
        purchasedTotal: invoice ? numberValue(invoice.invoiceTotal || invoice.productsTotal) : 0,
        openTotal: 0,
        lastPurchaseDate: invoice?.entryDate || invoice?.issueDate || "",
        unlinkedItems: 0,
      };
      rows[supplierKey].unlinkedItems += 1;
    });
  return Object.values(rows).sort((a, b) => b.purchasedTotal - a.purchasedTotal);
}

function Tarifas({ data }) {
  return (
    <div className="viewStack">
      <section className="contentGrid two">
        <Panel title="Tarifas base">
          <Table
            columns={["Período", "Tipo", "1 diária", "2 diárias", "3 diárias"]}
            rows={data.tarifasBase.map((item) => [
              item["Período"],
              item["Tipo"],
              formatCurrency(item["1 diária"]),
              formatCurrency(item["2 diárias"]),
              formatCurrency(item["3 diárias"]),
            ])}
          />
        </Panel>
        <Panel title="Ajuste por unidade">
          <Table
            columns={["Unidade", "Variação", "Capacidade", "Observação"]}
            rows={data.ajusteUnidades.map((item) => [
              item.Unidade,
              `${Math.round(numberValue(item["Variação %"]) * 100)}%`,
              item.Capacidade,
              item.Observação,
            ])}
          />
        </Panel>
      </section>
      <Panel title="OTAs e comissões">
        <Table
          columns={["Canal", "Comissão OTA", "Correção", "Taxa MT", "Aplicação"]}
          rows={data.otas.map((item) => [
            item["Canal / OTA"],
            `${Math.round(numberValue(item["Comissão OTA %"]) * 1000) / 10}%`,
            `${Math.round(numberValue(item["Correção %"]) * 1000) / 10}%`,
            `${Math.round(numberValue(item["Taxa MT %"]) * 1000) / 10}%`,
            item.Aplicação,
          ])}
        />
      </Panel>
    </div>
  );
}

function Relatorios({ data }) {
  const [month, setMonth] = useState(isoDate(new Date()).slice(0, 7));
  const report = useMemo(() => buildMonthlyReport(data, month), [data, month]);

  return (
    <div className="viewStack">
      <Panel title="Relatório mensal">
        <div className="reportHeader">
          <Input label="Mês de análise" value={month} onChange={setMonth} />
          <div className="reportHeadline">
            <MetricLine label="Ocupação" value={`${Math.round(report.occupancy * 100)}%`} />
            <MetricLine label="Diárias vendidas" value={report.roomNights} />
            <MetricLine label="Diária média" value={formatCurrency(report.adr)} />
            <MetricLine label="RevPAR" value={formatCurrency(report.revpar)} />
          </div>
        </div>
      </Panel>

      <section className="kpiGrid">
        <article className="kpiCard">
          <span>Receita hospedagem</span>
          <strong>{formatCurrency(report.receitaHospedagem)}</strong>
        </article>
        <article className="kpiCard">
          <span>Consumo hóspedes</span>
          <strong>{formatCurrency(report.receitaConsumo)}</strong>
        </article>
        <article className="kpiCard">
          <span>Receitas extras</span>
          <strong>{formatCurrency(report.receitasExtras)}</strong>
        </article>
        <article className="kpiCard">
          <span>Despesas</span>
          <strong className="negative">{formatCurrency(report.despesas)}</strong>
        </article>
        <article className="kpiCard">
          <span>Resultado</span>
          <strong className={report.resultado < 0 ? "negative" : ""}>{formatCurrency(report.resultado)}</strong>
        </article>
        <article className="kpiCard">
          <span>Saldo aberto</span>
          <strong className={report.saldoAberto > 0 ? "negative" : ""}>{formatCurrency(report.saldoAberto)}</strong>
        </article>
      </section>

      <section className="contentGrid two">
        <Panel title="Receita por canal">
          <SimpleBars rows={report.canais} valueKey="total" labelKey="label" />
        </Panel>
        <Panel title="Receita por cabana">
          <SimpleBars rows={report.cabanas} valueKey="total" labelKey="label" />
        </Panel>
      </section>

      <section className="contentGrid two">
        <Panel title="DRE simples">
          <Table
            columns={["Linha", "Valor"]}
            rows={[
              ["Hospedagem", formatCurrency(report.receitaHospedagem)],
              ["Consumo", formatCurrency(report.receitaConsumo)],
              ["Receitas extras", formatCurrency(report.receitasExtras)],
              ["Receita cavalos", formatCurrency(report.receitaCavalos)],
              ["Despesas gerais", <strong className="negative">{formatCurrency(report.despesas)}</strong>],
              ["Despesas cavalos", <strong className="negative">{formatCurrency(report.despesaCavalos)}</strong>],
              ["Resultado operacional", <strong className={report.resultado < 0 ? "negative" : ""}>{formatCurrency(report.resultado)}</strong>],
            ]}
          />
        </Panel>
        <Panel title="Reservas do mês">
          <Table
            columns={["Reserva", "Hóspede", "Cabana", "Período", "Canal", "Total", "Saldo"]}
            rows={report.reservas.map(({ reserva, folio }) => [
              reserva.id,
              reserva.hospede,
              reserva.cabana,
              `${formatDate(reserva.checkIn)} a ${formatDate(reserva.checkOut)}`,
              reserva.canal,
              formatCurrency(folio.total),
              <strong className={folio.saldo > 0 ? "negative" : ""}>{formatCurrency(folio.saldo)}</strong>,
            ])}
            empty="Nenhuma reserva neste mês."
          />
        </Panel>
      </section>
    </div>
  );
}

function buildMonthlyReport(data, month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 1);
  const days = Math.round((end - start) / 86400000);
  const cabanaCount = Math.max(1, data.listas.cabanas_full?.length ?? data.listas.cabanas?.length ?? 1);
  const inMonth = (value) => {
    const date = parseDate(value);
    return !Number.isNaN(date.getTime()) && start <= date && date < end;
  };
  const overlaps = (reserva) => {
    const checkIn = parseDate(reserva.checkIn);
    const checkOut = parseDate(reserva.checkOut);
    return reserva.status !== "Cancelado" && !Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime()) && checkIn < end && start < checkOut;
  };

  const reservas = data.reservas
    .filter(overlaps)
    .map((reserva) => ({ reserva, folio: calcReservationFolio(reserva, data.consumos, data.pagamentos) }));
  const roomNights = reservas.reduce((total, { reserva }) => total + nightsInsideRange(reserva.checkIn, reserva.checkOut, start, end), 0);
  const receitaHospedagem = reservas.reduce((total, { folio }) => total + folio.hospedagem, 0);
  const receitaConsumo = data.consumos.filter((item) => inMonth(item.data)).reduce((total, item) => total + consumptionTotal(item), 0);
  const receitasExtras = data.receitasExtras.filter((item) => inMonth(item.data)).reduce((total, item) => total + numberValue(item.valor), 0);
  const despesas = data.despesas.filter((item) => inMonth(item.data)).reduce((total, item) => total + numberValue(item.valor), 0);
  const receitaPasseios = (data.ridingReservations ?? []).filter((item) => inMonth(item.data) && item.status === "Concluída").reduce((total, item) => total + numberValue(item.valor), 0);
  const receitaCavalos = receitaPasseios + data.movCavalos.filter((item) => inMonth(item.data) && item.tipo === "Receita").reduce((total, item) => total + numberValue(item.valor), 0);
  const despesaCavalos = data.movCavalos.filter((item) => inMonth(item.data) && item.tipo === "Despesa").reduce((total, item) => total + numberValue(item.valor), 0);
  const saldoAberto = reservas.reduce((total, { folio }) => total + Math.max(0, folio.saldo), 0);

  return {
    roomNights,
    occupancy: roomNights / (cabanaCount * days),
    adr: roomNights ? receitaHospedagem / roomNights : 0,
    revpar: receitaHospedagem / (cabanaCount * days),
    receitaHospedagem,
    receitaConsumo,
    receitasExtras,
    despesas,
    receitaCavalos,
    despesaCavalos,
    resultado: receitaHospedagem + receitaConsumo + receitasExtras + receitaCavalos - despesas - despesaCavalos,
    saldoAberto,
    canais: groupReservationRevenue(reservas, "canal"),
    cabanas: groupReservationRevenue(reservas, "cabana"),
    reservas,
  };
}

function nightsInsideRange(checkIn, checkOut, start, end) {
  const arrival = parseDate(checkIn);
  const departure = parseDate(checkOut);
  const from = arrival > start ? arrival : start;
  const to = departure < end ? departure : end;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
  return Math.round((to - from) / 86400000);
}

function groupReservationRevenue(rows, field) {
  return Object.values(
    rows.reduce((acc, { reserva, folio }) => {
      const label = reserva[field] || "Sem informação";
      acc[label] ??= { label, total: 0 };
      acc[label].total += folio.hospedagem;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);
}

const horseStatusOptions = ["Disponível", "Reservado", "Em passeio", "Descanso", "Vetado", "Manutenção", "Aposentado"];
const horseUseProfiles = ["Infantil", "Iniciante", "Intermediário", "Avançado", "Guia"];
const riderExperienceOptions = ["Nunca montou", "Iniciante", "Intermediário", "Avançado"];
const ridingDifficultyOptions = ["Fácil", "Média", "Avançada"];
const ridingReservationStatusOptions = ["Pré-reserva", "Pendente termo", "Confirmada", "Check-in feito", "Em andamento", "Concluída", "Cancelada", "No-show", "Reembolsada"];

const defaultRidingActivities = [
  { id: "ACT-CURTA", nome: "Volta curta", duracaoMinutos: 15, dificuldade: "Fácil", preco: 80, capacidadeMaxima: 2, idadeMinima: 5, pesoMaximo: 90, exigeGuia: true, termoObrigatorio: true, descansoMinutos: 30, rota: "Área do Rancho" },
  { id: "ACT-LAGO", nome: "Trilha do lago", duracaoMinutos: 45, dificuldade: "Fácil", preco: 160, capacidadeMaxima: 6, idadeMinima: 8, pesoMaximo: 95, exigeGuia: true, termoObrigatorio: true, descansoMinutos: 45, rota: "Lago" },
  { id: "ACT-MATA", nome: "Trilha da mata", duracaoMinutos: 90, dificuldade: "Média", preco: 280, capacidadeMaxima: 4, idadeMinima: 12, pesoMaximo: 90, exigeGuia: true, termoObrigatorio: true, descansoMinutos: 75, rota: "Mata" },
];

function Cavalos({ data, addCavalo, addHorse, addRidingActivity, addRidingReservation, addHorseHealthRecord, updateItem, removeItem }) {
  const [horseForm, setHorseForm] = useState(defaultHorseForm());
  const [activityForm, setActivityForm] = useState(defaultActivityForm());
  const [reservationForm, setReservationForm] = useState(defaultRidingReservationForm(data));
  const [healthForm, setHealthForm] = useState({});
  const [financeForm, setFinanceForm] = useState({});
  const [selectedHorseId, setSelectedHorseId] = useState("");
  const horses = data.horses ?? [];
  const activities = [...defaultRidingActivities, ...(data.ridingActivities ?? [])];
  const ridingReservations = data.ridingReservations ?? [];
  const selectedHorse = horses.find((horse) => horse.id === selectedHorseId) ?? horses[0];
  const today = isoDate(new Date());
  const todayReservations = ridingReservations.filter((item) => item.data === today && !["Cancelada", "No-show", "Reembolsada"].includes(item.status));
  const activeRideReservations = ridingReservations.filter((item) => !["Concluída", "Cancelada", "No-show", "Reembolsada"].includes(item.status));
  const availableHorses = horses.filter((horse) => horseIsBookable(horse));
  const horseReports = horses.map((horse) => buildHorseReport(horse, ridingReservations, activities, data.horseHealthRecords ?? []));
  const reservationIssues = validateRidingReservation(reservationForm, horses, activities, ridingReservations);
  const selectedHorseReport = selectedHorse ? buildHorseReport(selectedHorse, ridingReservations, activities, data.horseHealthRecords ?? []) : null;

  const submitHorse = (event) => {
    event.preventDefault();
    addHorse(horseForm);
    setHorseForm(defaultHorseForm());
  };
  const submitActivity = (event) => {
    event.preventDefault();
    addRidingActivity(activityForm);
    setActivityForm(defaultActivityForm());
  };
  const submitReservation = (event) => {
    event.preventDefault();
    if (reservationIssues.blockers.length) return;
    addRidingReservation({
      ...reservationForm,
      cavaloId: getHorse(reservationForm.cavaloId, horses)?.id || reservationForm.cavaloId,
      atividadeId: getActivity(reservationForm.atividadeId, activities)?.id || reservationForm.atividadeId,
      valor: reservationForm.valor || getActivity(reservationForm.atividadeId, activities)?.preco || 0,
      status: reservationIssues.warnings.length ? "Pendente termo" : "Confirmada",
    });
    setReservationForm(defaultRidingReservationForm(data));
  };
  const submitHealth = (event) => {
    event.preventDefault();
    if (!selectedHorse) return;
    addHorseHealthRecord({ cavaloId: selectedHorse.id, cavalo: selectedHorse.nome, ...healthForm });
    setHealthForm({});
  };
  const submitFinance = (event) => {
    event.preventDefault();
    addCavalo(financeForm);
    setFinanceForm({});
  };

  return (
    <div className="viewStack">
      <section className="kpiGrid">
        <article className="kpiCard"><span>Cavalos cadastrados</span><strong>{horses.length}</strong></article>
        <article className="kpiCard"><span>Disponíveis</span><strong>{availableHorses.length}</strong></article>
        <article className="kpiCard"><span>Passeios hoje</span><strong>{todayReservations.length}</strong></article>
        <article className="kpiCard"><span>Reservas ativas</span><strong>{activeRideReservations.length}</strong></article>
        <article className="kpiCard"><span>Receita equestre</span><strong>{formatCurrency(ridingReservations.filter((item) => item.status === "Concluída").reduce((total, item) => total + numberValue(item.valor), 0))}</strong></article>
        <article className="kpiCard"><span>Alertas</span><strong className={horseReports.some((item) => item.alerts.length) ? "negative" : ""}>{horseReports.reduce((total, item) => total + item.alerts.length, 0)}</strong></article>
      </section>

      <section className="horseBoard">
        {horses.length === 0 ? (
          <div className="emptyHorseBoard">
            <strong>Nenhum cavalo cadastrado.</strong>
            <span>Cadastre os animais para ativar disponibilidade, pareamento e checklists.</span>
          </div>
        ) : horseReports.map((report) => (
          <button key={report.horse.id} className={`horseCard ${selectedHorse?.id === report.horse.id ? "active" : ""}`} onClick={() => setSelectedHorseId(report.horse.id)}>
            <div className="horseCardTop">
              <div><strong>{report.horse.nome || report.horse.codigo || "Sem nome"}</strong><span>{report.horse.codigo || "Sem código"}</span></div>
              <span className={horseStatusClass(report.horse.status)}>{report.horse.status || "Disponível"}</span>
            </div>
            <div className="horseMiniGrid">
              <MetricLine label="Perfil" value={report.horse.perfilUso || "-"} />
              <MetricLine label="Peso máx." value={`${numberValue(report.horse.pesoMaximo) || 0} kg`} />
              <MetricLine label="Uso hoje" value={`${Math.round(report.minutesToday / 60 * 10) / 10}h`} />
              <MetricLine label="Próximo" value={report.nextRide || "Livre"} />
            </div>
            {report.alerts.length > 0 && <span className="horseAlert">{report.alerts[0]}</span>}
          </button>
        ))}
      </section>

      <section className="contentGrid two">
        <FormPanel title="Cadastro do cavalo" onSubmit={submitHorse} submitLabel="Salvar cavalo">
          <Input label="Nome" value={horseForm.nome} onChange={(nome) => setHorseForm({ ...horseForm, nome })} required />
          <Input label="Código / baia" value={horseForm.codigo} onChange={(codigo) => setHorseForm({ ...horseForm, codigo })} />
          <Select label="Status" value={horseForm.status} options={horseStatusOptions} onChange={(status) => setHorseForm({ ...horseForm, status })} />
          <Select label="Perfil de uso" value={horseForm.perfilUso} options={horseUseProfiles} onChange={(perfilUso) => setHorseForm({ ...horseForm, perfilUso })} />
          <Input label="Temperamento" value={horseForm.temperamento} onChange={(temperamento) => setHorseForm({ ...horseForm, temperamento })} />
          <Input label="Peso máximo kg" type="number" value={horseForm.pesoMaximo} onChange={(pesoMaximo) => setHorseForm({ ...horseForm, pesoMaximo })} />
          <Input label="Limite horas/dia" type="number" value={horseForm.limiteHorasDia} onChange={(limiteHorasDia) => setHorseForm({ ...horseForm, limiteHorasDia })} />
          <Input label="Descanso min." type="number" value={horseForm.descansoMinutos} onChange={(descansoMinutos) => setHorseForm({ ...horseForm, descansoMinutos })} />
          <Input label="Última ferrageamento" type="date" value={horseForm.ultimoFerrageamento} onChange={(ultimoFerrageamento) => setHorseForm({ ...horseForm, ultimoFerrageamento })} />
          <Input label="Último veterinário" type="date" value={horseForm.ultimoVeterinario} onChange={(ultimoVeterinario) => setHorseForm({ ...horseForm, ultimoVeterinario })} />
          <Input label="Restrições" value={horseForm.restricoes} onChange={(restricoes) => setHorseForm({ ...horseForm, restricoes })} />
          <Input label="Obs. veterinárias" value={horseForm.obsVeterinarias} onChange={(obsVeterinarias) => setHorseForm({ ...horseForm, obsVeterinarias })} />
        </FormPanel>

        <FormPanel title="Passeio / aluguel" onSubmit={submitActivity} submitLabel="Salvar passeio">
          <Input label="Nome da atividade" value={activityForm.nome} onChange={(nome) => setActivityForm({ ...activityForm, nome })} required />
          <Input label="Rota / trilha" value={activityForm.rota} onChange={(rota) => setActivityForm({ ...activityForm, rota })} />
          <Select label="Dificuldade" value={activityForm.dificuldade} options={ridingDifficultyOptions} onChange={(dificuldade) => setActivityForm({ ...activityForm, dificuldade })} />
          <Input label="Duração min." type="number" value={activityForm.duracaoMinutos} onChange={(duracaoMinutos) => setActivityForm({ ...activityForm, duracaoMinutos })} />
          <Input label="Preço" type="number" value={activityForm.preco} onChange={(preco) => setActivityForm({ ...activityForm, preco })} />
          <Input label="Capacidade" type="number" value={activityForm.capacidadeMaxima} onChange={(capacidadeMaxima) => setActivityForm({ ...activityForm, capacidadeMaxima })} />
          <Input label="Idade mínima" type="number" value={activityForm.idadeMinima} onChange={(idadeMinima) => setActivityForm({ ...activityForm, idadeMinima })} />
          <Input label="Peso máximo kg" type="number" value={activityForm.pesoMaximo} onChange={(pesoMaximo) => setActivityForm({ ...activityForm, pesoMaximo })} />
          <Checkbox label="Exige guia" checked={Boolean(activityForm.exigeGuia)} onChange={(exigeGuia) => setActivityForm({ ...activityForm, exigeGuia })} />
          <Checkbox label="Termo obrigatório" checked={Boolean(activityForm.termoObrigatorio)} onChange={(termoObrigatorio) => setActivityForm({ ...activityForm, termoObrigatorio })} />
        </FormPanel>
      </section>

      <section className="contentGrid two">
        <FormPanel title="Reserva equestre" onSubmit={submitReservation} submitLabel="Salvar reserva" disabled={reservationIssues.blockers.length > 0}>
          <Input label="Cliente / hóspede" value={reservationForm.cliente} onChange={(cliente) => setReservationForm({ ...reservationForm, cliente })} required />
          <Select label="Reserva hotel" value={reservationForm.reservaHotelId} options={(data.reservas ?? []).map((reserva) => `${reserva.id} - ${reserva.hospede}`)} onChange={(reservaHotelId) => setReservationForm({ ...reservationForm, reservaHotelId })} />
          <Input label="Data" type="date" value={reservationForm.data} onChange={(dateValue) => setReservationForm({ ...reservationForm, data: dateValue })} required />
          <Input label="Horário" value={reservationForm.horario} onChange={(horario) => setReservationForm({ ...reservationForm, horario })} />
          <Select label="Atividade" value={reservationForm.atividadeId} options={activities.map((activity) => `${activity.id} - ${activity.nome}`)} onChange={(atividadeId) => setReservationForm({ ...reservationForm, atividadeId, valor: getActivity(atividadeId, activities)?.preco ?? reservationForm.valor })} required />
          <Select label="Cavalo" value={reservationForm.cavaloId} options={horses.map((horse) => `${horse.id} - ${horse.nome || horse.codigo}`)} onChange={(cavaloId) => setReservationForm({ ...reservationForm, cavaloId })} required />
          <Input label="Participantes" type="number" value={reservationForm.participantes} onChange={(participantes) => setReservationForm({ ...reservationForm, participantes })} />
          <Input label="Guia / instrutor" value={reservationForm.guia} onChange={(guia) => setReservationForm({ ...reservationForm, guia })} />
          <Input label="Peso cavaleiro kg" type="number" value={reservationForm.pesoCavaleiro} onChange={(pesoCavaleiro) => setReservationForm({ ...reservationForm, pesoCavaleiro })} />
          <Input label="Idade cavaleiro" type="number" value={reservationForm.idadeCavaleiro} onChange={(idadeCavaleiro) => setReservationForm({ ...reservationForm, idadeCavaleiro })} />
          <Select label="Experiência" value={reservationForm.experiencia} options={riderExperienceOptions} onChange={(experiencia) => setReservationForm({ ...reservationForm, experiencia })} />
          <Input label="Valor" type="number" value={reservationForm.valor} onChange={(valor) => setReservationForm({ ...reservationForm, valor })} />
          <Select label="Forma de pagamento" value={reservationForm.formaPagamento} options={data.listas.formas_pgto} onChange={(formaPagamento) => setReservationForm({ ...reservationForm, formaPagamento })} />
          <Input label="Clima / pista" value={reservationForm.clima} onChange={(clima) => setReservationForm({ ...reservationForm, clima })} />
          <Checkbox label="Termo assinado" checked={Boolean(reservationForm.termoAssinado)} onChange={(termoAssinado) => setReservationForm({ ...reservationForm, termoAssinado })} />
          <Checkbox label="Capacete confirmado" checked={Boolean(reservationForm.capaceteConfirmado)} onChange={(capaceteConfirmado) => setReservationForm({ ...reservationForm, capaceteConfirmado })} />
          <Checkbox label="Vincular à conta do quarto" checked={Boolean(reservationForm.vincularQuarto)} onChange={(vincularQuarto) => setReservationForm({ ...reservationForm, vincularQuarto })} />
          {[...reservationIssues.blockers, ...reservationIssues.warnings].map((issue) => <div className="formNotice" key={issue}>{issue}</div>)}
        </FormPanel>

        <Panel title="Pareamento e segurança">
          <div className="safetyPanel">
            <MetricLine label="Cavalo selecionado" value={getHorse(reservationForm.cavaloId, horses)?.nome || "-"} />
            <MetricLine label="Atividade" value={getActivity(reservationForm.atividadeId, activities)?.nome || "-"} />
            <MetricLine label="Duração" value={`${numberValue(getActivity(reservationForm.atividadeId, activities)?.duracaoMinutos)} min`} />
            <MetricLine label="Dificuldade" value={getActivity(reservationForm.atividadeId, activities)?.dificuldade || "-"} />
            {reservationIssues.blockers.length === 0 ? (
              <div className="okBox"><strong>Pareamento liberado</strong><span>Sem bloqueio crítico para esta reserva.</span></div>
            ) : (
              <div className="alertBox"><strong>Bloqueado</strong><span>Corrija os itens críticos antes de iniciar o passeio.</span></div>
            )}
          </div>
        </Panel>
      </section>

      <section className="contentGrid two">
        <Panel title="Agenda equestre">
          <Table
            columns={["Data", "Horário", "Cliente", "Atividade", "Cavalo", "Status", "Segurança", "Ações"]}
            rows={ridingReservations.map((item) => {
              const horse = getHorse(item.cavaloId, horses);
              const activity = getActivity(item.atividadeId, activities);
              const issues = validateRidingReservation(item, horses, activities, ridingReservations, item.id);
              return [
                formatDate(item.data),
                item.horario || "-",
                item.cliente || "-",
                activity?.nome || item.atividadeId || "-",
                horse?.nome || item.cavaloId || "-",
                <InlineSelect value={item.status || "Confirmada"} options={ridingReservationStatusOptions} onChange={(status) => updateItem("ridingReservations", item.id, { status })} />,
                <span className={issues.blockers.length ? "status danger" : issues.warnings.length ? "status warn" : "status"}>{issues.blockers.length ? "Bloqueado" : issues.warnings.length ? "Atenção" : "Ok"}</span>,
                <div className="rowActions">
                  <button className="smallButton" onClick={() => updateItem("ridingReservations", item.id, { status: "Em andamento", checkinSeguranca: true })}>Iniciar</button>
                  <button className="smallButton mutedButton" onClick={() => updateItem("ridingReservations", item.id, { status: "Concluída", checklistRetorno: true })}>Concluir</button>
                  <IconButton title="Excluir" onClick={() => secureRemove("ridingReservations", item.id, removeItem, "reserva equestre")} icon={Trash2} />
                </div>,
              ];
            })}
            empty="Nenhuma reserva equestre lançada."
          />
        </Panel>

        <Panel title="Ficha do cavalo">
          {selectedHorse && selectedHorseReport ? (
            <div className="horseProfile">
              <div className="detailHeader">
                <div>
                  <p className="eyebrow">{selectedHorse.codigo || "Sem código"}</p>
                  <h3>{selectedHorse.nome}</h3>
                  <span>{selectedHorse.perfilUso || "-"} · {selectedHorse.temperamento || "temperamento não informado"}</span>
                </div>
                <span className={horseStatusClass(selectedHorse.status)}>{selectedHorse.status || "Disponível"}</span>
              </div>
              <div className="detailMetrics">
                <MetricLine label="Peso máx." value={`${numberValue(selectedHorse.pesoMaximo)} kg`} />
                <MetricLine label="Uso hoje" value={`${Math.round(selectedHorseReport.minutesToday / 60 * 10) / 10}h`} />
                <MetricLine label="Limite/dia" value={`${numberValue(selectedHorse.limiteHorasDia) || 0}h`} />
                <MetricLine label="Ferrageamento" value={formatDate(selectedHorse.ultimoFerrageamento)} />
                <MetricLine label="Veterinário" value={formatDate(selectedHorse.ultimoVeterinario)} />
                <MetricLine label="Próximo passeio" value={selectedHorseReport.nextRide || "-"} />
              </div>
              {selectedHorseReport.alerts.length > 0 && <div className="alertBox"><strong>Alertas</strong><span>{selectedHorseReport.alerts.join(" · ")}</span></div>}
              <form className="formPanel" onSubmit={submitHealth}>
                <div className="formGrid compact">
                  <Input label="Data saúde" type="date" value={healthForm.data} onChange={(dataValue) => setHealthForm({ ...healthForm, data: dataValue })} />
                  <Select label="Tipo registro" value={healthForm.tipo} options={["Veterinário", "Ferrageamento", "Vacina", "Vermífugo", "Observação"]} onChange={(tipo) => setHealthForm({ ...healthForm, tipo })} />
                  <Input label="Descrição" value={healthForm.descricao} onChange={(descricao) => setHealthForm({ ...healthForm, descricao })} />
                  <Input label="Responsável" value={healthForm.responsavel} onChange={(responsavel) => setHealthForm({ ...healthForm, responsavel })} />
                </div>
                <button className="primaryButton" type="submit">Salvar saúde</button>
              </form>
            </div>
          ) : <p className="muted">Selecione ou cadastre um cavalo.</p>}
        </Panel>
      </section>

      <section className="contentGrid two">
        <FormPanel title="Lançar financeiro de cavalos" onSubmit={submitFinance}>
          <Input label="Data" type="date" value={financeForm.data} onChange={(dataValue) => setFinanceForm({ ...financeForm, data: dataValue })} required />
          <Select label="Tipo" value={financeForm.tipo} options={data.listas.tipo_mov} onChange={(tipo) => setFinanceForm({ ...financeForm, tipo })} required />
          <Select label="Categoria" value={financeForm.categoria} options={data.listas.categorias_cavalos} onChange={(categoria) => setFinanceForm({ ...financeForm, categoria })} />
          <Input label="Cliente / fornecedor" value={financeForm.nome} onChange={(nome) => setFinanceForm({ ...financeForm, nome })} />
          <Input label="Descrição" value={financeForm.descricao} onChange={(descricao) => setFinanceForm({ ...financeForm, descricao })} />
          <Input label="Valor" type="number" value={financeForm.valor} onChange={(valor) => setFinanceForm({ ...financeForm, valor })} required />
        </FormPanel>
        <Panel title="Movimentos financeiros">
          <Table
            columns={["Data", "Tipo", "Categoria", "Nome", "Valor", ""]}
            rows={(data.movCavalos ?? []).map((item) => [
              formatDate(item.data),
              item.tipo,
              item.categoria,
              item.nome,
              formatCurrency(item.valor),
              <IconButton title="Excluir" onClick={() => secureRemove("movCavalos", item.id, removeItem, "movimento de cavalos")} icon={Trash2} />,
            ])}
            empty="Nenhum movimento lançado."
          />
        </Panel>
      </section>
    </div>
  );
}

function defaultHorseForm() {
  return {
    status: "Disponível",
    perfilUso: "Iniciante",
    temperamento: "Calmo",
    pesoMaximo: 90,
    limiteHorasDia: 3,
    descansoMinutos: 45,
  };
}

function defaultActivityForm() {
  return {
    dificuldade: "Fácil",
    duracaoMinutos: 30,
    preco: 120,
    capacidadeMaxima: 4,
    idadeMinima: 8,
    pesoMaximo: 90,
    exigeGuia: true,
    termoObrigatorio: true,
    descansoMinutos: 45,
  };
}

function defaultRidingReservationForm(data) {
  const firstReservation = data.reservas?.[0];
  return {
    cliente: firstReservation?.hospede || "",
    reservaHotelId: firstReservation ? `${firstReservation.id} - ${firstReservation.hospede}` : "",
    data: isoDate(new Date()),
    horario: "10:00",
    participantes: 1,
    experiencia: "Iniciante",
    valor: 0,
    termoAssinado: false,
    capaceteConfirmado: true,
    vincularQuarto: Boolean(firstReservation),
    clima: "Ok",
  };
}

function getHorse(idOrLabel, horses = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return horses.find((horse) => horse.id === clean);
}

function getActivity(idOrLabel, activities = []) {
  const clean = String(idOrLabel ?? "").split(" - ")[0];
  return activities.find((activity) => activity.id === clean);
}

function horseIsBookable(horse) {
  return ["Disponível", "Reservado"].includes(horse.status || "Disponível");
}

function validateRidingReservation(form, horses = [], activities = [], reservations = [], ignoreId = "") {
  const blockers = [];
  const warnings = [];
  const horse = getHorse(form.cavaloId, horses);
  const activity = getActivity(form.atividadeId, activities);
  if (!String(form.cliente ?? "").trim()) blockers.push("Informe o cliente ou hóspede.");
  if (!form.data) blockers.push("Informe a data do passeio.");
  if (!form.horario) warnings.push("Informe o horário para organizar a agenda.");
  if (!horse) blockers.push("Selecione um cavalo.");
  if (!activity) blockers.push("Selecione a atividade.");
  if (horse && !horseIsBookable(horse)) blockers.push(`${horse.nome || "Cavalo"} não está disponível para reserva.`);
  if (horse && numberValue(form.pesoCavaleiro) > 0 && numberValue(form.pesoCavaleiro) > numberValue(horse.pesoMaximo)) blockers.push("Peso do cavaleiro acima do limite do cavalo.");
  if (activity && numberValue(form.pesoCavaleiro) > 0 && numberValue(activity.pesoMaximo) > 0 && numberValue(form.pesoCavaleiro) > numberValue(activity.pesoMaximo)) blockers.push("Peso do cavaleiro acima do limite da atividade.");
  if (activity && numberValue(form.idadeCavaleiro) > 0 && numberValue(form.idadeCavaleiro) < numberValue(activity.idadeMinima)) blockers.push("Idade abaixo da mínima da atividade.");
  if (activity?.dificuldade === "Avançada" && !["Intermediário", "Avançado"].includes(form.experiencia)) blockers.push("Atividade avançada exige cavaleiro intermediário ou avançado.");
  if (horse?.perfilUso === "Avançado" && ["Nunca montou", "Iniciante"].includes(form.experiencia)) warnings.push("Cavaleiro iniciante com cavalo de perfil avançado.");
  if (activity?.termoObrigatorio && !form.termoAssinado) warnings.push("Termo ainda não assinado.");
  if (!form.capaceteConfirmado) warnings.push("Capacete precisa ser confirmado antes da saída.");
  if (horse && form.data && form.horario && reservations.some((item) => item.id !== ignoreId && getHorse(item.cavaloId, horses)?.id === horse.id && item.data === form.data && item.horario === form.horario && !["Cancelada", "No-show", "Reembolsada"].includes(item.status))) {
    blockers.push("Cavalo já reservado neste horário.");
  }
  return { blockers, warnings };
}

function buildHorseReport(horse, reservations = [], activities = [], healthRecords = []) {
  const today = isoDate(new Date());
  const todayRows = reservations.filter((item) => item.cavaloId === horse.id && item.data === today && !["Cancelada", "No-show", "Reembolsada"].includes(item.status));
  const minutesToday = todayRows.reduce((total, item) => total + numberValue(getActivity(item.atividadeId, activities)?.duracaoMinutos), 0);
  const nextRide = todayRows
    .slice()
    .sort((a, b) => String(a.horario || "").localeCompare(String(b.horario || "")))[0]?.horario;
  const alerts = [];
  const limitMinutes = numberValue(horse.limiteHorasDia) * 60;
  if (limitMinutes > 0 && minutesToday >= limitMinutes) alerts.push("Limite diário atingido");
  if (["Vetado", "Manutenção", "Aposentado"].includes(horse.status)) alerts.push(`Status: ${horse.status}`);
  if (dateOlderThanDays(horse.ultimoFerrageamento, 45)) alerts.push("Ferrageamento vencido");
  if (dateOlderThanDays(horse.ultimoVeterinario, 180)) alerts.push("Veterinário vencido");
  const recentCritical = healthRecords.find((item) => item.cavaloId === horse.id && String(item.tipo || "").toLowerCase().includes("observ") && String(item.descricao || "").toLowerCase().includes("vet"));
  if (recentCritical) alerts.push("Observação veterinária crítica");
  return { horse, minutesToday, nextRide, alerts };
}

function dateOlderThanDays(value, days) {
  const date = parseDate(value);
  if (!value || Number.isNaN(date.getTime())) return false;
  return (new Date() - date) / 86400000 > days;
}

function horseStatusClass(status = "Disponível") {
  if (["Vetado", "Manutenção", "Aposentado"].includes(status)) return "status danger";
  if (["Reservado", "Em passeio", "Descanso"].includes(status)) return "status warn";
  return "status";
}

function Cadastros({ data, addListValue, addCardapioItem, addEstoqueItem }) {
  const [cabana, setCabana] = useState("");
  const [canal, setCanal] = useState("");
  const [forma, setForma] = useState("");
  const [produto, setProduto] = useState({});
  const [estoque, setEstoque] = useState({});

  const saveList = (event, listName, value, setter) => {
    event.preventDefault();
    addListValue(listName, value);
    setter("");
  };

  const saveProduto = (event) => {
    event.preventDefault();
    addCardapioItem({
      Produto: produto.nome,
      Categoria: produto.categoria,
      Descrição: produto.descricao,
      Unidade: produto.unidade,
      "Custo unitário": produto.custo,
      "Preço de venda": produto.preco,
      "Ativo?": "Sim",
    });
    setProduto({});
  };

  const saveEstoque = (event) => {
    event.preventDefault();
    addEstoqueItem({
      Produto: estoque.produto,
      Descrição: estoque.descricao,
      "Qtd. inicial / comprada": estoque.quantidade,
      Unidade: estoque.unidade,
      "Valor compra unitário": estoque.custo,
      "Qtd. mínima": estoque.minimo,
      "Data da compra": estoque.dataCompra,
      Observações: estoque.observacoes,
    });
    setEstoque({});
  };

  return (
    <div className="viewStack">
      <section className="contentGrid three">
        <form className="panel formPanel" onSubmit={(event) => saveList(event, "cabanas_full", cabana, setCabana)} noValidate>
          <h2>Nova cabana</h2>
          <Input label="Nome da cabana" value={cabana} onChange={setCabana} />
          <button className="primaryButton" type="submit"><Plus size={17} /> Salvar</button>
        </form>
        <form className="panel formPanel" onSubmit={(event) => saveList(event, "canais_ota", canal, setCanal)} noValidate>
          <h2>Novo canal</h2>
          <Input label="Canal / OTA" value={canal} onChange={setCanal} />
          <button className="primaryButton" type="submit"><Plus size={17} /> Salvar</button>
        </form>
        <form className="panel formPanel" onSubmit={(event) => saveList(event, "formas_pgto", forma, setForma)} noValidate>
          <h2>Forma de pagamento</h2>
          <Input label="Forma" value={forma} onChange={setForma} />
          <button className="primaryButton" type="submit"><Plus size={17} /> Salvar</button>
        </form>
      </section>

      <FormPanel title="Novo produto do cardápio" onSubmit={saveProduto}>
        <Input label="Produto" value={produto.nome} onChange={(nome) => setProduto({ ...produto, nome })} />
        <Input label="Categoria" value={produto.categoria} onChange={(categoria) => setProduto({ ...produto, categoria })} />
        <Input label="Descrição" value={produto.descricao} onChange={(descricao) => setProduto({ ...produto, descricao })} />
        <Input label="Unidade" value={produto.unidade} onChange={(unidade) => setProduto({ ...produto, unidade })} />
        <Input label="Custo unitário" type="number" value={produto.custo} onChange={(custo) => setProduto({ ...produto, custo })} />
        <Input label="Preço de venda" type="number" value={produto.preco} onChange={(preco) => setProduto({ ...produto, preco })} />
      </FormPanel>

      <FormPanel title="Entrada de estoque base" onSubmit={saveEstoque}>
        <Select label="Produto" value={estoque.produto} options={data.cardapio.map((item) => item.Produto).filter(Boolean)} onChange={(produtoValue) => setEstoque({ ...estoque, produto: produtoValue })} />
        <Input label="Descrição" value={estoque.descricao} onChange={(descricao) => setEstoque({ ...estoque, descricao })} />
        <Input label="Qtd. inicial" type="number" value={estoque.quantidade} onChange={(quantidade) => setEstoque({ ...estoque, quantidade })} />
        <Input label="Unidade" value={estoque.unidade} onChange={(unidade) => setEstoque({ ...estoque, unidade })} />
        <Input label="Custo unitário" type="number" value={estoque.custo} onChange={(custo) => setEstoque({ ...estoque, custo })} />
        <Input label="Qtd. mínima" type="number" value={estoque.minimo} onChange={(minimo) => setEstoque({ ...estoque, minimo })} />
        <Input label="Data da compra" type="date" value={estoque.dataCompra} onChange={(dataCompra) => setEstoque({ ...estoque, dataCompra })} />
        <Input label="Observações" value={estoque.observacoes} onChange={(observacoes) => setEstoque({ ...estoque, observacoes })} />
      </FormPanel>

      <section className="contentGrid two">
        <Panel title="Cabanas e canais">
          <Table
            columns={["Cabanas", "Canais / OTAs", "Formas de pagamento"]}
            rows={zipColumns([
              data.listas.cabanas_full ?? data.listas.cabanas ?? [],
              data.listas.canais_ota ?? [],
              data.listas.formas_pgto ?? [],
            ])}
          />
        </Panel>
        <Panel title="Produtos do cardápio">
          <Table
            columns={["Produto", "Categoria", "Unidade", "Custo", "Venda"]}
            rows={data.cardapio.slice(0, 20).map((item) => [
              item.Produto,
              item.Categoria || "-",
              item.Unidade || "-",
              formatCurrency(item["Custo unitário"]),
              formatCurrency(item["Preço de venda"]),
            ])}
          />
        </Panel>
      </section>
    </div>
  );
}

function zipColumns(columns) {
  const max = Math.max(...columns.map((column) => column.length), 0);
  return Array.from({ length: max }, (_, index) => columns.map((column) => column[index] ?? ""));
}

function Documentos({ data }) {
  const reservaOptions = data.reservas.map((item) => `${item.id} | ${item.hospede} | ${item.cabana}`);
  const [reservaLabel, setReservaLabel] = useState("");
  const [documentKind, setDocumentKind] = useState("confirmacao");
  const reservaId = reservaLabel.split(" | ")[0];
  const reserva = data.reservas.find((item) => item.id === reservaId) ?? data.reservas[0];
  const folio = reserva ? calcReservationFolio(reserva, data.consumos, data.pagamentos) : null;
  const content = reserva ? buildDocumentContent(reserva, folio, documentKind, data) : null;

  return (
    <div className="viewStack">
      <Panel title="Gerar documento">
        <div className="documentControls">
          <Select label="Reserva" value={reservaLabel} options={reservaOptions} onChange={setReservaLabel} />
          <div className="segmented">
            <button className={documentKind === "confirmacao" ? "active" : ""} onClick={() => setDocumentKind("confirmacao")}>Confirmação</button>
            <button className={documentKind === "recibo" ? "active" : ""} onClick={() => setDocumentKind("recibo")}>Recibo</button>
            <button className={documentKind === "ficha" ? "active" : ""} onClick={() => setDocumentKind("ficha")}>Ficha</button>
          </div>
          <button className="primaryButton" onClick={() => window.print()}><Printer size={17} /> Imprimir</button>
        </div>
      </Panel>

      <section className="contentGrid two">
        <Panel title="Resumo da reserva">
          {reserva && folio ? (
            <>
              <MetricLine label="Reserva" value={reserva.id} />
              <MetricLine label="Hóspede" value={reserva.hospede || "-"} />
              <MetricLine label="Cabana" value={reserva.cabana || "-"} />
              <MetricLine label="Período" value={`${formatDate(reserva.checkIn)} a ${formatDate(reserva.checkOut)}`} />
              <MetricLine label="Total" value={formatCurrency(folio.total)} />
              <MetricLine label="Saldo" value={formatCurrency(folio.saldo)} />
            </>
          ) : (
            <p className="muted">Nenhuma reserva disponível.</p>
          )}
        </Panel>
        <Panel title="Itens da conta">
          <Table
            columns={["Item", "Valor"]}
            rows={folio ? [
              ["Hospedagem", formatCurrency(folio.hospedagem)],
              ["Consumo", formatCurrency(folio.consumo)],
              ["Pago", formatCurrency(folio.pago)],
              ["Saldo", <strong className={folio.saldo > 0 ? "negative" : ""}>{formatCurrency(folio.saldo)}</strong>],
            ] : []}
            empty="Selecione uma reserva."
          />
        </Panel>
      </section>

      <section className="documentPaper">
        {content ? (
          <>
            <div className="documentHeader">
              <div>
                <strong>Rancho das Neves</strong>
                <span>Controle de hospedagem</span>
              </div>
              <small>{formatDate(isoDate(new Date()))}</small>
            </div>
            <h2>{content.title}</h2>
            {content.blocks.map((block) => (
              <div className="documentBlock" key={block.title}>
                <h3>{block.title}</h3>
                {block.lines.map(([label, value]) => (
                  <p key={label}><strong>{label}:</strong> {value}</p>
                ))}
              </div>
            ))}
            <div className="signatureGrid">
              <span>Assinatura do hóspede</span>
              <span>Responsável Rancho das Neves</span>
            </div>
          </>
        ) : (
          <p className="muted">Selecione uma reserva para gerar o documento.</p>
        )}
      </section>
    </div>
  );
}

function buildDocumentContent(reserva, folio, kind, data) {
  const base = {
    reserva: [
      ["Reserva", reserva.id],
      ["Hóspede", reserva.hospede || "-"],
      ["Telefone", reserva.telefone || "-"],
      ["E-mail", reserva.email || "-"],
      ["Documento", reserva.documento || "-"],
      ["Cabana", reserva.cabana || "-"],
      ["Check-in", formatDate(reserva.checkIn)],
      ["Check-out", formatDate(reserva.checkOut)],
      ["Noites", nightsBetween(reserva.checkIn, reserva.checkOut)],
      ["Adultos", reserva.adultos ?? "-"],
      ["Crianças", reserva.criancas ?? "-"],
      ["Pets", reserva.pets ?? "-"],
      ["Veículo / placa", reserva.veiculo || "-"],
      ["Canal", reserva.canal || "-"],
    ],
    conta: [
      ["Hospedagem", formatCurrency(folio.hospedagem)],
      ["Consumo", formatCurrency(folio.consumo)],
      ["Total", formatCurrency(folio.total)],
      ["Pago", formatCurrency(folio.pago)],
      ["Saldo", formatCurrency(folio.saldo)],
    ],
  };

  if (kind === "recibo") {
    return {
      title: "Recibo de Hospedagem",
      blocks: [
        { title: "Identificação", lines: base.reserva.slice(0, 6) },
        { title: "Valores", lines: base.conta },
        { title: "Pagamentos", lines: (data.pagamentos ?? []).filter((item) => item.reservaId === reserva.id).map((item) => [formatDate(item.data), `${item.formaPagamento || "-"} - ${formatCurrency(item.valor)}`]) },
      ],
    };
  }

  if (kind === "ficha") {
    return {
      title: "Ficha de Hospedagem",
      blocks: [
        { title: "Dados da reserva", lines: base.reserva },
        { title: "Observações internas", lines: [["Status", reserva.status || "Reservado"], ["Limpeza", reserva.limpeza || "Pendente"], ["Observações", reserva.observacoes || "-"]] },
      ],
    };
  }

  return {
    title: "Confirmação de Reserva",
    blocks: [
      { title: "Reserva confirmada", lines: base.reserva },
      { title: "Resumo financeiro", lines: base.conta },
    ],
  };
}

function Backup({ data, importData, canExport = true, canAdmin = true }) {
  const tables = backupTables(data);
  const [importStatus, setImportStatus] = useState("");

  const downloadBackup = () => {
    downloadText(
      `rancho-neves-backup-${isoDate(new Date())}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2),
      "application/json",
    );
  };

  const exportCsv = (name, rows) => {
    downloadText(`rancho-neves-${name}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      importData(parsed.data ?? parsed);
      setImportStatus(`Importado: ${file.name}`);
    } catch {
      setImportStatus("Arquivo inválido. Use um backup JSON exportado pelo sistema.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="viewStack">
      <section className="contentGrid two">
        <Panel title="Backup completo">
          <div className="backupActions">
            <button className="primaryButton" onClick={downloadBackup} disabled={!canExport}><Database size={17} /> Baixar backup JSON</button>
            {canAdmin && <label className="fileImport">
              <span>Restaurar backup JSON</span>
              <input type="file" accept="application/json,.json" onChange={handleImport} />
            </label>}
            {importStatus && <p className="muted">{importStatus}</p>}
          </div>
        </Panel>
        <Panel title="Resumo dos dados">
          <MetricLine label="Reservas" value={data.reservas.length} />
          <MetricLine label="Cotações" value={(data.cotacoes ?? []).length} />
          <MetricLine label="Pagamentos" value={(data.pagamentos ?? []).length} />
          <MetricLine label="Tarefas" value={(data.tarefas ?? []).length} />
          <MetricLine label="Consumos" value={data.consumos.length} />
        </Panel>
      </section>

      <Panel title="Exportar tabelas CSV">
        <Table
          columns={["Tabela", "Registros", "Exportar"]}
          rows={tables.map((table) => [
            table.label,
            table.rows.length,
            <button className="smallButton" disabled={!canExport} onClick={() => exportCsv(table.name, table.rows)}>CSV</button>,
          ])}
        />
      </Panel>
    </div>
  );
}

function backupTables(data) {
  return [
    { name: "reservas", label: "Reservas", rows: data.reservas },
    { name: "cotacoes", label: "Cotações", rows: data.cotacoes ?? [] },
    { name: "pagamentos", label: "Pagamentos", rows: data.pagamentos ?? [] },
    { name: "tarefas", label: "Tarefas", rows: data.tarefas ?? [] },
    { name: "consumos", label: "Consumos", rows: data.consumos },
    { name: "ingredientes", label: "Ingredientes", rows: data.ingredients ?? [] },
    { name: "produtos-cardapio", label: "Produtos cardápio", rows: data.menuProducts ?? [] },
    { name: "fichas-tecnicas", label: "Fichas técnicas", rows: data.recipeItems ?? [] },
    { name: "mov-estoque", label: "Mov. estoque", rows: data.stockMovements ?? [] },
    { name: "fornecedores", label: "Fornecedores", rows: data.suppliers ?? [] },
    { name: "notas-compra", label: "Notas compra", rows: data.purchaseInvoices ?? [] },
    { name: "itens-notas-compra", label: "Itens notas compra", rows: data.purchaseInvoiceItems ?? [] },
    { name: "mapeamento-fornecedor", label: "Map. fornecedor", rows: data.supplierProductMappings ?? [] },
    { name: "contas-pagar", label: "Contas a pagar", rows: data.accountsPayable ?? [] },
    { name: "crm-hospedes", label: "CRM hóspedes", rows: data.guestProfiles ?? [] },
    { name: "usuarios", label: "Usuários", rows: data.users ?? [] },
    { name: "perfis", label: "Perfis", rows: data.roles ?? [] },
    { name: "permissoes", label: "Permissões", rows: data.rolePermissions ?? [] },
    { name: "auditoria", label: "Auditoria", rows: data.auditLogs ?? [] },
    { name: "receitas-extras", label: "Receitas extras", rows: data.receitasExtras },
    { name: "despesas", label: "Despesas", rows: data.despesas },
    { name: "mov-cavalos", label: "Mov. Cavalos", rows: data.movCavalos },
    { name: "cavalos", label: "Cavalos", rows: data.horses ?? [] },
    { name: "passeios-cavalos", label: "Passeios cavalos", rows: data.ridingActivities ?? [] },
    { name: "reservas-cavalos", label: "Reservas cavalos", rows: data.ridingReservations ?? [] },
    { name: "saude-cavalos", label: "Saúde cavalos", rows: data.horseHealthRecords ?? [] },
    { name: "produtos", label: "Produtos", rows: data.cardapio },
    { name: "estoque", label: "Estoque", rows: data.estoque },
  ];
}

function toCsv(rows) {
  if (!rows?.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function DriveConfig({ data, syncNow, pullNow, syncStatus, syncMessage, canSync = true }) {
  const webAppUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEB_APP_URL;
  const sheetUrl = import.meta.env.VITE_GOOGLE_SHEET_URL;
  const isBusy = syncStatus === "syncing" || syncStatus === "pulling";
  return (
    <div className="viewStack">
      <Panel title="Configuração Google Sheets">
        <div className="driveBox">
          <MetricLine label="Web App URL" value={webAppUrl ? "Configurado" : "Não configurado"} />
          <MetricLine label="Planilha" value={sheetUrl ? "Atalho configurado" : "Atalho não configurado"} />
          <MetricLine label="Status" value={syncStatusLabel(syncStatus)} />
          <div className={syncStatus === "error" ? "alertBox" : "okBox"}>
            <strong>{syncStatus === "error" ? "Atenção" : "Conexão pronta"}</strong>
            <span>{syncMessage}</span>
          </div>
          <div className="rowActions">
            <button className="primaryButton" onClick={() => syncNow(data)} disabled={isBusy || !webAppUrl || !canSync}>
              <Database size={17} /> Enviar para Sheets
            </button>
            <button className="primaryButton" onClick={pullNow} disabled={isBusy || !webAppUrl || !canSync}>
              <Database size={17} /> Puxar do Sheets
            </button>
            {sheetUrl && (
              <a className="sheetLink" href={sheetUrl} target="_blank" rel="noreferrer">
                Abrir planilha
              </a>
            )}
          </div>
        </div>
      </Panel>
      <Panel title="Passos para ativar">
        <ol className="setupList">
          <li>Crie uma Google Sheet no Drive.</li>
          <li>Abra Extensões &gt; Apps Script.</li>
          <li>Cole o script abaixo ou o arquivo <code>google-apps-script.js</code> do projeto.</li>
          <li>Publique como Web App com acesso para qualquer pessoa com o link.</li>
          <li>Copie a URL do Web App e configure <code>VITE_GOOGLE_SYNC_SECRET</code> no arquivo <code>.env</code>.</li>
          <li>Opcional: coloque a URL da planilha em <code>VITE_GOOGLE_SHEET_URL</code> para exibir o atalho.</li>
        </ol>
      </Panel>
      <Panel title="Google Apps Script para colar na planilha">
        <pre className="codeBlock">{appsScriptSnippet}</pre>
      </Panel>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function AvailabilityCalendar({ cabanas = [], reservas = [], startDate, onSelectSlot }) {
  const start = parseDate(startDate);
  const days = Array.from({ length: 30 }, (_, index) => addDays(start, index));
  const validStart = !Number.isNaN(start.getTime());

  if (!validStart) {
    return <p className="muted">Informe uma data inicial válida para ver o calendário.</p>;
  }

  return (
    <div className="calendarWrap">
      <table className="availabilityTable">
        <thead>
          <tr>
            <th>Cabana</th>
            {days.map((day) => (
              <th key={isoDate(day)}>
                <span>{day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cabanas.filter(Boolean).map((cabana) => (
            <tr key={cabana}>
              <th>{cabana}</th>
              {days.map((day) => {
                const reservation = reservas.find((item) => reservationCoversDay(item, cabana, day));
                const checkout = reservas.find((item) => item.cabana === cabana && isoDate(parseDate(item.checkOut)) === isoDate(day));
                const className = reservation ? "busy" : checkout ? "checkout" : "free";
                return (
                  <td key={`${cabana}-${isoDate(day)}`} className={className} title={reservation?.hospede || checkout?.hospede || "Livre"}>
                    {reservation ? reservation.hospede?.slice(0, 1) || "R" : checkout ? "S" : (
                      <button className="calendarSlot" type="button" onClick={() => onSelectSlot?.(cabana, day)} title={`Reservar ${cabana} em ${formatDate(isoDate(day))}`}>
                        +
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function reservationCoversDay(reserva, cabana, day) {
  if (reserva.cabana !== cabana || reserva.status === "Cancelado") return false;
  const checkIn = parseDate(reserva.checkIn);
  const checkOut = parseDate(reserva.checkOut);
  const current = parseDate(isoDate(day));
  if ([checkIn, checkOut, current].some((date) => Number.isNaN(date.getTime()))) return false;
  return checkIn <= current && current < checkOut;
}

function FormPanel({ title, onSubmit, children, submitLabel = "Salvar", disabled = false }) {
  return (
    <form className="panel formPanel" onSubmit={onSubmit} noValidate>
      <h2>{title}</h2>
      <div className="formGrid">{children}</div>
      <button className="primaryButton" type="submit" disabled={disabled}><Plus size={17} /> {submitLabel}</button>
    </form>
  );
}

function InlineSelect({ value, options = [], onChange }) {
  return (
    <select className="inlineSelect" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      {value === "" && <option value="">Selecionar</option>}
      {(options ?? []).filter(Boolean).map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function Input({ label, value = "", onChange, type = "text", required = false }) {
  const id = useStableId(label);
  const inputType = type === "number" || type === "date" ? "text" : type;
  const inputMode = type === "number" ? "decimal" : type === "date" ? "numeric" : undefined;
  const placeholder = type === "date" ? "2026-05-20" : undefined;
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type={inputType} inputMode={inputMode} placeholder={placeholder} value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function Checkbox({ label, checked = false, onChange }) {
  const id = useStableId(label);
  return (
    <label className="checkField" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Select({ label, value = "", options = [], onChange, required = false }) {
    const id = useStableId(label);

    const normalizedOptions = (options ?? [])
        .filter(Boolean)
        .map((option) => {
            if (typeof option === "object") {
                return {
                    value: option.value ?? option.id ?? "",
                    label: option.label ?? option.name ?? option.value ?? ""
                };
            }

            const text = String(option);
            return {
                value: text.includes(" - ") ? text.split(" - ")[0] : text,
                label: text
            };
        });

    return (
        <label className="field" htmlFor={id}>
            <span>{label}</span>
            <select
                id={id}
                value={value ?? ""}
                onChange={(event) => onChange(event.target.value)}
                required={required}
            >
                <option value="">Selecionar</option>
                {normalizedOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function useStableId(label) {
  const reactId = useId().replaceAll(":", "");
  return `${label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${reactId}`;
}

function Table({ columns, rows = [], empty = "Sem dados." }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="emptyCell">{empty}</td></tr>
          ) : rows.map((row, idx) => (
            <tr key={idx}>{row.map((cell, cellIdx) => <td key={cellIdx}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleBars({ rows, labelKey, valueKey }) {
  const max = Math.max(1, ...rows.map((row) => row[valueKey]));
  return (
    <div className="bars">
      {rows.length === 0 && <p className="muted">Sem reservas lançadas.</p>}
      {rows.map((row) => (
        <div className="barRow" key={row[labelKey]}>
          <span>{row[labelKey]}</span>
          <div><i style={{ width: `${(row[valueKey] / max) * 100}%` }} /></div>
          <strong>{formatCurrency(row[valueKey])}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricLine({ label, value }) {
  return (
    <div className="metricLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IconButton({ title, onClick, icon: Icon }) {
  return (
    <button className="iconButton" type="button" onClick={onClick} title={title}>
      <Icon size={16} />
    </button>
  );
}

const appsScriptSnippet = `const TABLES = [
  "reservas",
  "receitas_extras",
  "despesas",
  "consumo_hospedes",
  "cotacoes",
  "pagamentos",
  "tarefas",
  "mov_cavalos",
  "horses",
  "riding_activities",
  "riding_reservations",
  "horse_health_records",
  "ingredients",
  "menu_products",
  "recipe_items",
  "stock_movements",
  "suppliers",
  "purchase_invoices",
  "purchase_invoice_items",
  "supplier_product_mappings",
  "accounts_payable",
  "guest_profiles",
  "users",
  "roles",
  "role_permissions",
  "audit_logs",
  "repasses_mt",
  "tarifas_base",
  "ajuste_unidades",
  "otas",
  "listas_config",
  "produtos",
  "estoque",
];

const SCRIPT_SECRET = "NxccTf1kP-yua24r8AYNurbuCBrpWhRRyg9VLISObOA";

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback || "callback";
  if (!isAuthorized_(params.secret)) {
    return jsonp_(callback, { ok: false, error: "Acesso negado." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tables = {};
  TABLES.forEach(function (name) {
    tables[name] = readTable_(ss, name);
  });
  return jsonp_(callback, { ok: true, tables: tables });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  if (!isAuthorized_(payload.secret)) {
    return json_({ ok: false, error: "Acesso negado." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(payload.tables || {}).forEach(function ([name, rows]) {
    writeTable_(ss, name, rows || []);
  });
  return json_({ ok: true });
}

function isAuthorized_(secret) {
  return Boolean(SCRIPT_SECRET) && secret === SCRIPT_SECRET;
}

function jsonp_(callback, payload) {
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readTable_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "";
      });
    })
    .map(function (row) {
      const item = {};
      headers.forEach(function (header, index) {
        item[header] = row[index];
      });
      return item;
    });
}

function writeTable_(ss, name, rows) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clearContents();
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap(function (row) {
    return Object.keys(row);
  }))];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length)
    .setValues(rows.map(function (row) {
      return headers.map(function (header) {
        return row[header] == null ? "" : row[header];
      });
    }));
  sheet.setFrozenRows(1);
}`;

const rootElement = document.getElementById("root");
globalThis.__ranchoRoot ??= createRoot(rootElement);
globalThis.__ranchoRoot.render(<App />);

