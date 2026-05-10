import { useEffect, useMemo, useState } from "react";
import { pullFromGoogleSheets, pushToGoogleSheets } from "./lib/googleSheets.js";

const storageKey = "rancho-neves-data-v1";
const localCollections = [
  "reservas",
  "receitasExtras",
  "despesas",
  "consumos",
  "movCavalos",
  "repasses",
  "cotacoes",
  "pagamentos",
  "tarefas",
  "horses",
  "ridingActivities",
  "ridingReservations",
  "horseHealthRecords",
  "ingredients",
  "menuProducts",
  "recipeItems",
  "stockMovements",
  "suppliers",
  "purchaseInvoices",
  "purchaseInvoiceItems",
  "supplierProductMappings",
  "accountsPayable",
  "guestProfiles",
  "users",
  "roles",
  "rolePermissions",
  "auditLogs",
];

const defaultRoles = [
  { id: "ROLE-ADMIN", name: "Admin", description: "Acesso total ao sistema.", locked: true },
  { id: "ROLE-GERENCIA", name: "Gerência", description: "Gestão operacional com restrição a usuários.", locked: true },
  { id: "ROLE-RECEPCAO", name: "Recepção", description: "Reservas, operação, hóspedes e pagamentos.", locked: true },
  { id: "ROLE-FINANCEIRO", name: "Financeiro", description: "Financeiro, pagamentos, notas e relatórios.", locked: true },
  { id: "ROLE-ESTOQUE", name: "Estoque", description: "Estoque, cardápio, fornecedores e notas.", locked: true },
  { id: "ROLE-LIMPEZA", name: "Limpeza", description: "Operação, tarefas e status das cabanas.", locked: true },
];

const permissionModules = ["dashboard", "operacao", "reservas", "hospedes", "cotacoes", "pagamentos", "tarefas", "financeiro", "estoque", "tarifas", "relatorios", "cavalos", "cadastros", "documentos", "backup", "drive", "usuarios"];
const permissionActions = ["ler", "adicionar", "editar", "apagar", "exportar", "sincronizar", "lancar", "admin"];
const roleTemplates = {
  "ROLE-ADMIN": { all: true },
  "ROLE-GERENCIA": {
    ler: permissionModules.filter((module) => module !== "usuarios"),
    adicionar: ["reservas", "hospedes", "cotacoes", "pagamentos", "tarefas", "financeiro", "estoque", "cavalos", "cadastros", "documentos"],
    editar: ["operacao", "reservas", "hospedes", "cotacoes", "pagamentos", "tarefas", "financeiro", "estoque", "cavalos", "cadastros", "documentos"],
    apagar: ["cotacoes", "tarefas"],
    exportar: ["relatorios", "backup"],
    sincronizar: ["drive"],
    lancar: ["estoque"],
  },
  "ROLE-RECEPCAO": {
    ler: ["dashboard", "operacao", "reservas", "hospedes", "cotacoes", "pagamentos", "tarefas", "documentos"],
    adicionar: ["reservas", "hospedes", "cotacoes", "pagamentos", "tarefas"],
    editar: ["operacao", "reservas", "hospedes", "cotacoes", "pagamentos", "tarefas"],
    apagar: ["cotacoes"],
  },
  "ROLE-FINANCEIRO": {
    ler: ["dashboard", "reservas", "pagamentos", "financeiro", "estoque", "relatorios", "backup", "drive"],
    adicionar: ["pagamentos", "financeiro", "estoque"],
    editar: ["pagamentos", "financeiro", "estoque"],
    apagar: ["pagamentos", "financeiro"],
    exportar: ["relatorios", "backup"],
    sincronizar: ["drive"],
    lancar: ["estoque"],
  },
  "ROLE-ESTOQUE": {
    ler: ["dashboard", "estoque", "relatorios"],
    adicionar: ["estoque"],
    editar: ["estoque"],
    apagar: ["estoque"],
    lancar: ["estoque"],
  },
  "ROLE-LIMPEZA": {
    ler: ["dashboard", "operacao", "tarefas"],
    adicionar: ["tarefas"],
    editar: ["operacao", "tarefas"],
  },
};

function buildDefaultPermissions() {
  return defaultRoles.flatMap((role) => {
    const template = roleTemplates[role.id] ?? {};
    const actions = template.all
      ? Object.fromEntries(permissionActions.map((action) => [action, permissionModules]))
      : template;
    return Object.entries(actions).flatMap(([action, modules]) =>
      (modules ?? []).map((module) => ({
        id: `PERM-${role.id}-${module}-${action}`,
        roleId: role.id,
        module,
        action,
        allowed: true,
      })),
    );
  });
}

const defaultRolePermissions = buildDefaultPermissions();

function defaultUsers() {
  const envUser = import.meta.env.VITE_APP_ACCESS_USER || "admin";
  const envPin = import.meta.env.VITE_APP_ACCESS_PIN || "647375";
  return [
    {
      id: "USR-ADMIN",
      name: "Administrador",
      username: envUser,
      email: "",
      pin: envPin,
      roleId: "ROLE-ADMIN",
      active: true,
      locked: true,
    },
  ];
}

function normalizeData(seed, stored = {}) {
  const data = { ...seed, ...stored };
  localCollections.forEach((collection) => {
    data[collection] ??= [];
  });
  data.roles = data.roles.length ? data.roles : defaultRoles;
  data.rolePermissions = data.rolePermissions.length ? data.rolePermissions : defaultRolePermissions;
  data.users = data.users.length ? data.users : defaultUsers();
  return data;
}

export function useRanchoStore(seed) {
  const [data, setData] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return normalizeData(seed);
    try {
      return normalizeData(seed, JSON.parse(stored));
    } catch {
      return normalizeData(seed);
    }
  });
  const [syncStatus, setSyncStatus] = useState("local");
  const [syncMessage, setSyncMessage] = useState("Dados salvos neste navegador.");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data]);

  return useMemo(() => {
    const markDirty = () => {
      setSyncStatus("dirty");
      setSyncMessage("Alterações locais ainda não enviadas para o Google Sheets.");
    };

    const addItem = (collection, payload) => {
      const id = `${collection.slice(0, 3).toUpperCase()}-${Date.now()}`;
      setData((current) => ({
        ...current,
        [collection]: [{ id, createdAt: new Date().toISOString(), ...payload }, ...current[collection]],
      }));
      markDirty();
    };

    return {
      data,
      syncStatus,
      syncMessage,
      addReserva(payload) {
        const nextNumber = data.reservas.length + 1;
        addItem("reservas", {
          id: `RES-${String(nextNumber).padStart(4, "0")}`,
          status: "Reservado",
          limpeza: "Pendente",
          valorPago: 0,
          adultos: 2,
          criancas: 0,
          pets: 0,
          ...payload,
        });
      },
      addFinanceiro(collection, payload) {
        addItem(collection, payload);
      },
      addConsumo(payload) {
        addItem("consumos", payload);
      },
      addCotacao(payload) {
        addItem("cotacoes", payload);
      },
      addPagamento(payload) {
        addItem("pagamentos", payload);
      },
      addTarefa(payload) {
        addItem("tarefas", payload);
      },
      addListValue(listName, value) {
        const cleanValue = String(value ?? "").trim();
        if (!cleanValue) return;
        setData((current) => {
          const currentValues = current.listas?.[listName] ?? [];
          if (currentValues.includes(cleanValue)) return current;
          return {
            ...current,
            listas: {
              ...current.listas,
              [listName]: [...currentValues, cleanValue],
            },
          };
        });
        markDirty();
      },
      addCardapioItem(payload) {
        setData((current) => ({
          ...current,
          cardapio: [{ Ativo: "Sim", ...payload }, ...current.cardapio],
        }));
        markDirty();
      },
      addEstoqueItem(payload) {
        setData((current) => ({
          ...current,
          estoque: [{ Produto: payload.Produto, ...payload }, ...current.estoque],
        }));
        markDirty();
      },
      addIngredient(payload) {
        addItem("ingredients", {
          active: true,
          currentStock: 0,
          minimumStock: 0,
          averageCost: 0,
          ...payload,
        });
      },
      addMenuProduct(payload) {
        addItem("menuProducts", {
          active: true,
          allowIndividualSale: true,
          costTotal: 0,
          grossProfit: 0,
          cmvPercent: 0,
          marginPercent: 0,
          ...payload,
        });
      },
      addRecipeItem(payload) {
        addItem("recipeItems", payload);
      },
      addStockMovement(payload) {
        addItem("stockMovements", payload);
      },
      addSupplier(payload) {
        addItem("suppliers", { active: true, ...payload });
      },
      addPurchaseInvoice(payload) {
        addItem("purchaseInvoices", { status: "rascunho", ...payload });
      },
      addPurchaseInvoiceItem(payload) {
        addItem("purchaseInvoiceItems", payload);
      },
      addSupplierProductMapping(payload) {
        addItem("supplierProductMappings", payload);
      },
      addAccountPayable(payload) {
        addItem("accountsPayable", { status: "aberto", ...payload });
      },
      addGuestProfile(payload) {
        addItem("guestProfiles", payload);
      },
      addCavalo(payload) {
        addItem("movCavalos", payload);
      },
      addHorse(payload) {
        addItem("horses", {
          status: "Disponível",
          perfilUso: "Iniciante",
          pesoMaximo: 90,
          limiteHorasDia: 3,
          descansoMinutos: 45,
          ...payload,
        });
      },
      addRidingActivity(payload) {
        addItem("ridingActivities", {
          exigeGuia: true,
          termoObrigatorio: true,
          descansoMinutos: 45,
          ...payload,
        });
      },
      addRidingReservation(payload) {
        addItem("ridingReservations", {
          status: "Confirmada",
          termoAssinado: false,
          checkinSeguranca: false,
          checklistRetorno: false,
          incidente: false,
          ...payload,
        });
      },
      addHorseHealthRecord(payload) {
        addItem("horseHealthRecords", payload);
      },
      addUser(payload) {
        addItem("users", { active: true, ...payload });
      },
      addRole(payload) {
        addItem("roles", payload);
      },
      addRolePermission(payload) {
        addItem("rolePermissions", payload);
      },
      addAuditLog(payload) {
        addItem("auditLogs", payload);
      },
      removeItem(collection, id) {
        setData((current) => ({
          ...current,
          [collection]: current[collection].filter((item) => item.id !== id),
        }));
        markDirty();
      },
      updateItem(collection, id, patch) {
        setData((current) => ({
          ...current,
          [collection]: current[collection].map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        markDirty();
      },
      resetLocalData() {
        localStorage.removeItem(storageKey);
        setData(normalizeData(seed));
        setSyncStatus("local");
        setSyncMessage("Base local restaurada a partir dos dados importados.");
      },
      importData(nextData) {
        setData(normalizeData(seed, nextData));
        markDirty();
      },
      async syncNow(snapshot) {
        setSyncStatus("syncing");
        setSyncMessage("Enviando dados para o Google Sheets...");
        try {
          await pushToGoogleSheets(snapshot);
          setSyncStatus("synced");
          setSyncMessage(`Enviado para o Google Sheets em ${formatSyncTime(new Date())}.`);
        } catch (error) {
          console.error(error);
          setSyncStatus("error");
          setSyncMessage(error.message || "Não foi possível enviar para o Google Sheets.");
        }
      },
      async pullNow() {
        setSyncStatus("pulling");
        setSyncMessage("Puxando dados do Google Sheets...");
        try {
          const pulled = await pullFromGoogleSheets();
          setData(normalizeData(seed, pulled));
          setSyncStatus("synced");
          setSyncMessage(`Dados puxados do Google Sheets em ${formatSyncTime(new Date())}.`);
        } catch (error) {
          console.error(error);
          setSyncStatus("error");
          setSyncMessage(error.message || "Não foi possível puxar dados do Google Sheets.");
        }
      },
    };
  }, [data, seed, syncMessage, syncStatus]);
}

function formatSyncTime(date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
