export function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

export function formatDate(value) {
  if (!value) return "-";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function parseDate(value) {
  if (!value) return new Date("invalid");
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`);
  return new Date(text.includes("T") ? text : `${text}T00:00:00`);
}

export function isoDate(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function nightsBetween(checkIn, checkOut) {
  const start = parseDate(checkIn);
  const end = parseDate(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function reservationOverlaps(a, b) {
  if (!a.cabana || !b.cabana || a.cabana !== b.cabana) return false;
  if (a.status === "Cancelado" || b.status === "Cancelado") return false;
  const aIn = parseDate(a.checkIn);
  const aOut = parseDate(a.checkOut);
  const bIn = parseDate(b.checkIn);
  const bOut = parseDate(b.checkOut);
  if ([aIn, aOut, bIn, bOut].some((date) => Number.isNaN(date.getTime()))) return false;
  return aIn < bOut && bIn < aOut;
}

export function consumptionTotal(item) {
  return numberValue(item.quantidade) * numberValue(item.valorVenda);
}

export function calcReservationFolio(reserva, consumos = [], pagamentos = []) {
  const consumo = consumos
    .filter((item) => item.reservaId === reserva.id || (!item.reservaId && item.hospede === reserva.hospede))
    .reduce((total, item) => total + consumptionTotal(item), 0);
  const pagamentosReserva = pagamentos
    .filter((item) => item.reservaId === reserva.id)
    .filter((item) => !item.status || ["Recebido", "Conciliado"].includes(item.status))
    .reduce((total, item) => total + numberValue(item.valor), 0);
  const hospedagem = numberValue(reserva.valorBruto);
  const pago = numberValue(reserva.valorPago) + pagamentosReserva;
  const total = hospedagem + consumo;
  return {
    hospedagem,
    consumo,
    total,
    pago,
    saldo: total - pago,
  };
}

export function calcDashboard(data) {
  const today = isoDate(new Date());
  const receitaReservas = sum(data.reservas, "valorBruto");
  const recebidoReservas = sum(data.reservas, "valorPago");
  const receitasExtras = sum(data.receitasExtras, "valor");
  const despesas = sum(data.despesas, "valor");
  const receitaCavalos = data.movCavalos
    .filter((item) => item.tipo === "Receita")
    .reduce((total, item) => total + numberValue(item.valor), 0);
  const despesaCavalos = data.movCavalos
    .filter((item) => item.tipo === "Despesa")
    .reduce((total, item) => total + numberValue(item.valor), 0);
  const vendaConsumo = data.consumos.reduce(
    (total, item) => total + consumptionTotal(item),
    0,
  );
  const saldoHospedes = data.reservas.reduce(
    (total, reserva) => total + Math.max(0, calcReservationFolio(reserva, data.consumos, data.pagamentos).saldo),
    0,
  );
  const reservasPorCabana = Object.values(
    data.reservas.reduce((acc, reserva) => {
      const cabana = reserva.cabana || "Sem cabana";
      acc[cabana] ??= { cabana, total: 0, quantidade: 0 };
      acc[cabana].total += numberValue(reserva.valorBruto);
      acc[cabana].quantidade += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  const estoqueCritico = data.estoque
    .map((item) => ({
      produto: item.Produto,
      atual: numberValue(item["Qtd. atual"] ?? item["Qtd. inicial / comprada"]),
      minimo: numberValue(item["Qtd. mínima"] ?? item["Qtd. mÃ­nima"]),
    }))
    .filter((item) => item.produto && item.minimo > 0 && item.atual <= item.minimo);

  const recebidoMt = sum(data.repasses, "valorRecebido");
  const diferencaRepasse = data.repasses.reduce(
    (total, item) => total + numberValue(item.valorRecebido) - numberValue(item.valorEsperado),
    0,
  );

  return {
    receitaReservas,
    recebidoReservas,
    pendenteReservas: Math.max(0, receitaReservas - recebidoReservas),
    saldoHospedes,
    receitasExtras,
    receitaCavalos,
    despesaCavalos,
    vendaConsumo,
    despesas,
    resultado: receitaReservas + receitasExtras + receitaCavalos + vendaConsumo - despesas - despesaCavalos,
    reservasPorCabana,
    estoqueCritico,
    recebidoMt,
    diferencaRepasse,
    repassesPendentes: data.repasses.filter((item) => item.status !== "Recebido").length,
    chegadasHoje: data.reservas.filter((item) => isoDate(parseDate(item.checkIn)) === today),
    saidasHoje: data.reservas.filter((item) => isoDate(parseDate(item.checkOut)) === today),
    ocupadasHoje: data.reservas.filter((item) => {
      const checkIn = parseDate(item.checkIn);
      const checkOut = parseDate(item.checkOut);
      const current = parseDate(today);
      return item.status !== "Cancelado" && checkIn <= current && current < checkOut;
    }),
  };
}

function sum(rows, field) {
  return rows.reduce((total, item) => total + numberValue(item[field]), 0);
}
