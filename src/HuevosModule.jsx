import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DollarSign, Pencil, Plus, Trash2, TrendingDown, TrendingUp, X, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { API, fmt, todayLocalISO } from "./lib/utils";

// ─── Módulo independiente: Huevos ────────────────────────────────────────────
const EGG_BOX_UNITS = 180;
const EGG_TRAY_UNITS = 30;
const EGG_STORAGE_KEY = "inv_huevos_v1";
const EGG_MOVEMENTS_KEY = "inv_huevos_movimientos_v1";

const defaultEggInventory = [
  { id: "super", nombre: "Súper", stockHuevos: 0, costoCaja: 0, precioCaja: 0, precioBandeja: 0, precioVentaUnitario: 0, stockMinimoCajas: 5 },
  { id: "extra", nombre: "Extra", stockHuevos: 0, costoCaja: 0, precioCaja: 0, precioBandeja: 0, precioVentaUnitario: 0, stockMinimoCajas: 5 },
  { id: "primera", nombre: "Primera", stockHuevos: 0, costoCaja: 0, precioCaja: 0, precioBandeja: 0, precioVentaUnitario: 0, stockMinimoCajas: 5 },
  { id: "segunda", nombre: "Segunda", stockHuevos: 0, costoCaja: 0, precioCaja: 0, precioBandeja: 0, precioVentaUnitario: 0, stockMinimoCajas: 5 },
];

const loadEggInventory = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(EGG_STORAGE_KEY) || "null");
    return Array.isArray(saved) && saved.length ? saved : defaultEggInventory;
  } catch { return defaultEggInventory; }
};
const saveEggInventory = data => localStorage.setItem(EGG_STORAGE_KEY, JSON.stringify(data));
const loadEggMovements = () => {
  try { return JSON.parse(localStorage.getItem(EGG_MOVEMENTS_KEY) || "[]"); }
  catch { return []; }
};
const saveEggMovements = data => localStorage.setItem(EGG_MOVEMENTS_KEY, JSON.stringify(data));

const eggBreakdown = total => {
  const safe = Math.max(0, Number(total || 0));
  const cajas = Math.floor(safe / EGG_BOX_UNITS);
  const restoCaja = safe % EGG_BOX_UNITS;
  const bandejas = Math.floor(restoCaja / EGG_TRAY_UNITS);
  const unidades = restoCaja % EGG_TRAY_UNITS;
  return { cajas, bandejas, unidades };
};

// El "día" al que pertenece un movimiento: la fecha que el usuario eligió
// (fechaIngreso, disponible en entrada/venta/merma/rotos/trizados) o, si no
// hay, el día calendario de su registro real. Es la misma clave que usa el
// cálculo de lotes, para que "Movimientos por fecha" y "Lotes por fecha"
// siempre agrupen un movimiento en el mismo día.
const dayKeyOf = m => m.fechaIngreso || String(m.fecha || "").slice(0, 10);

// Suma/resta días a una fecha "YYYY-MM-DD" sin problemas de huso horario.
const shiftDate = (dateStr, delta) => {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const ddd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${ddd}`;
};

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const formatDayLabel = dateStr => {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  return { dayMonth: `${dt.getDate()} ${MONTH_LABELS[dt.getMonth()]}`, weekday: WEEKDAY_LABELS[dt.getDay()] };
};
const formatFullDate = dateStr => {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  return `${dt.getDate()} de ${MONTH_LABELS[dt.getMonth()]} de ${y}`;
};

// Lunes de la semana que contiene la fecha dada (para agrupar el inventario
// por semana en vez de mostrar un único total acumulado de siempre).
const getWeekStart = dateStr => {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  const day = dt.getDay(); // 0=Dom, 1=Lun, ... 6=Sáb
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const formatWeekLabel = mondayStr => {
  const sundayStr = shiftDate(mondayStr, 6);
  const [, mo1, d1] = mondayStr.split("-").map(Number);
  const [, mo2, d2] = sundayStr.split("-").map(Number);
  return mo1 === mo2
    ? `Semana del ${d1} al ${d2} de ${MONTH_LABELS[mo1 - 1]}`
    : `Semana del ${d1} de ${MONTH_LABELS[mo1 - 1]} al ${d2} de ${MONTH_LABELS[mo2 - 1]}`;
};

export default function EggModule({ D, card, inp, textPrimary, textSecondary, textMuted, bgCard2, borderColor, borderColor2, currentUser }) {
  const [tab, setTab] = useState("dashboard");
  const [inventory, setInventory] = useState(defaultEggInventory);
  const [movements, setMovements] = useState([]);
  const [loadingEggs, setLoadingEggs] = useState(true);
  const [showMovement, setShowMovement] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tipo: "entrada", calidadId: "super", cajas: "", bandejas: "", unidades: "",
    motivo: "Compra de mercadería", observaciones: "", precioCaja: "", precioBandeja: "",
    precioUnidad: "", descuento: "",
    valorUnitarioCompra: "", totalCompra: "", precioVentaUnitario: "",
    fechaIngreso: todayLocalISO(),
  });
  const [editForm, setEditForm] = useState({});
  const [ultimoCampoEditado, setUltimoCampoEditado] = useState(null); // "unitario" | "total" | "venta" | null
  const [movDate, setMovDate] = useState(todayLocalISO());
  const [balanceDate, setBalanceDate] = useState(todayLocalISO());
  const [showGananciaDetail, setShowGananciaDetail] = useState(true);
  const [expandedWeekCard, setExpandedWeekCard] = useState(null);
  const [expandedWeekDay, setExpandedWeekDay] = useState(null);

  const eggHeaders = {
    "Content-Type": "application/json",
    "x-usuario": currentUser?.usuario || "",
    "x-clave": currentUser?._clave || "",
  };

  const syncEggState = async (nextInventory, movement = null) => {
    const res = await fetch(`${API}/api/huevos/movimientos`, {
      method: "POST", headers: eggHeaders,
      body: JSON.stringify({ inventory: nextInventory, movement }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudieron guardar los huevos en el servidor.");
    setInventory(data.inventory || nextInventory);
    setMovements(data.movements || (movement ? [movement, ...movements] : movements));
    saveEggInventory(data.inventory || nextInventory);
    saveEggMovements(data.movements || (movement ? [movement, ...movements] : movements));
    return data;
  };

  useEffect(() => {
    if (!currentUser?.usuario || !currentUser?._clave) return;
    let cancelled = false;
    const load = async () => {
      setLoadingEggs(true);
      try {
        const res = await fetch(`${API}/api/huevos`, { headers: eggHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo cargar el inventario de huevos.");
        if (cancelled) return;
        let serverInventory = Array.isArray(data.inventory) ? data.inventory : defaultEggInventory;
        let serverMovements = Array.isArray(data.movements) ? data.movements : [];

        // Migrar una sola vez los huevos que estaban guardados localmente en el computador.
        const localInventory = loadEggInventory();
        const localMovements = loadEggMovements();
        const serverHasData = serverInventory.some(q => Number(q.stockHuevos || 0) > 0) || serverMovements.length > 0;
        const localHasData = localInventory.some(q => Number(q.stockHuevos || 0) > 0) || localMovements.length > 0;
        if (!serverHasData && localHasData) {
          const migration = await fetch(`${API}/api/huevos/migrar`, {
            method: "POST", headers: eggHeaders,
            body: JSON.stringify({ inventory: localInventory, movements: localMovements }),
          });
          const migrated = await migration.json();
          if (!migration.ok) throw new Error(migrated.error || "No se pudo migrar el inventario local.");
          serverInventory = migrated.inventory || localInventory;
          serverMovements = migrated.movements || localMovements;
        }
        setInventory(serverInventory);
        setMovements(serverMovements);
        saveEggInventory(serverInventory);
        saveEggMovements(serverMovements);
      } catch (e) {
        if (!cancelled) {
          setInventory(loadEggInventory());
          setMovements(loadEggMovements());
          setError(e.message || "Sin conexión: mostrando copia local.");
        }
      } finally { if (!cancelled) setLoadingEggs(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [currentUser?.usuario, currentUser?._clave]);

  const selectedQuality = inventory.find(q => q.id === form.calidadId) || inventory[0];
  const formUnits = (Number(form.cajas || 0) * EGG_BOX_UNITS)
    + (Number(form.bandejas || 0) * EGG_TRAY_UNITS)
    + Number(form.unidades || 0);
  const saleGross = form.tipo === "venta"
    ? (Number(form.cajas || 0) * Number(form.precioCaja || 0))
      + (Number(form.bandejas || 0) * Number(form.precioBandeja || 0))
      + (Number(form.unidades || 0) * Number(form.precioUnidad || 0))
    : 0;
  const saleDiscount = Math.max(0, Number(form.descuento || 0));
  const saleTotal = Math.max(0, saleGross - saleDiscount);
  const purchaseUnitValue = Math.max(0, Number(form.valorUnitarioCompra || 0));
  const purchaseTotal = Math.max(0, Number(form.totalCompra || 0));
  const saleUnitValue = Math.max(0, Number(form.precioVentaUnitario || 0));
  const expectedSaleTotal = formUnits * saleUnitValue;
  const expectedProfit = expectedSaleTotal - purchaseTotal;
  const expectedMargin = purchaseTotal > 0 ? (expectedProfit / purchaseTotal) * 100 : 0;

  const updateEggQuantity = (key, value) => {
    const nextForm = { ...form, [key]: value };
    const nextUnits =
      (Number(nextForm.cajas || 0) * EGG_BOX_UNITS)
      + (Number(nextForm.bandejas || 0) * EGG_TRAY_UNITS)
      + Number(nextForm.unidades || 0);

    if (form.tipo === "entrada") {
      if (Number(form.valorUnitarioCompra || 0) > 0) {
        nextForm.totalCompra = nextUnits > 0
          ? String(Math.round(nextUnits * Number(form.valorUnitarioCompra || 0)))
          : "";
      } else if (Number(form.totalCompra || 0) > 0) {
        nextForm.valorUnitarioCompra = nextUnits > 0
          ? String(Number((Number(form.totalCompra || 0) / nextUnits).toFixed(2)))
          : "";
      }
    }
    setForm(nextForm);
  };

  // Cada función solo escribe en SU PROPIO campo mientras el usuario escribe.
  // El campo derivado (el otro) se recalcula en el useEffect de abajo,
  // nunca dentro del mismo setState que dispara el onChange del campo activo.
  const updatePurchaseUnit = value => {
    setUltimoCampoEditado("unitario");
    setForm(f => ({ ...f, valorUnitarioCompra: value }));
  };

  const updatePurchaseTotal = value => {
    setUltimoCampoEditado("total");
    setForm(f => ({ ...f, totalCompra: value }));
  };

  const updateSaleUnitPrice = value => {
    setUltimoCampoEditado("venta");
    setForm(f => ({ ...f, precioVentaUnitario: value }));
  };

  // Recalcula el campo derivado SOLO después de que el campo activo se asentó,
  // y solo si el valor calculado realmente cambió (evita loops y saltos de cursor).
  useEffect(() => {
    if (form.tipo !== "entrada") return;

    if (ultimoCampoEditado === "unitario") {
      const unitValue = Math.max(0, Number(form.valorUnitarioCompra || 0));
      const nextTotal = formUnits > 0 && unitValue > 0
        ? String(Math.round(formUnits * unitValue))
        : "";
      if (nextTotal !== form.totalCompra) {
        setForm(f => ({ ...f, totalCompra: nextTotal }));
      }
    } else if (ultimoCampoEditado === "total") {
      const totalValue = Math.max(0, Number(form.totalCompra || 0));
      const nextUnit = formUnits > 0 && totalValue > 0
        ? String(Number((totalValue / formUnits).toFixed(2)))
        : "";
      if (nextUnit !== form.valorUnitarioCompra) {
        setForm(f => ({ ...f, valorUnitarioCompra: nextUnit }));
      }
    }
    // "venta" no tiene contraparte que recalcular; solo se registra para
    // mantener el mismo patrón y evitar que otro efecto la sobreescriba.
  }, [form.valorUnitarioCompra, form.totalCompra, formUnits, form.tipo, ultimoCampoEditado]);

  const registerMovement = async () => {
    setError("");
    if (!selectedQuality || formUnits <= 0) { setError("Ingresa una cantidad válida."); return; }
    if (["venta", "merma", "rotos", "trizados", "ajuste_salida"].includes(form.tipo) && formUnits > selectedQuality.stockHuevos) {
      setError(`Stock insuficiente. Disponible: ${selectedQuality.stockHuevos.toLocaleString("es-CL")} huevos.`); return;
    }

    if (form.tipo === "entrada" && !form.fechaIngreso) {
      setError("Selecciona la fecha de ingreso del lote."); return;
    }
    if (form.tipo === "entrada" && (purchaseUnitValue <= 0 || purchaseTotal <= 0)) {
      setError("Ingresa el valor unitario del huevo o el precio total de compra."); return;
    }
    if (form.tipo === "entrada" && saleUnitValue <= 0) {
      setError("Ingresa el precio de venta unitario del huevo."); return;
    }

    const sign = ["entrada", "ajuste_entrada"].includes(form.tipo) ? 1 : -1;
    let ingreso = 0;
    let costo = 0;
    if (form.tipo === "entrada") {
      costo = purchaseTotal;
    } else if (form.tipo === "venta") {
      if (saleTotal <= 0) { setError("Ingresa precios válidos para registrar la venta."); return; }
      ingreso = saleTotal;
      costo = (formUnits / EGG_BOX_UNITS) * Number(selectedQuality.costoCaja || 0);
    } else if (["merma", "rotos", "trizados"].includes(form.tipo)) {
      costo = (formUnits / EGG_BOX_UNITS) * Number(selectedQuality.costoCaja || 0);
    }

    const updatedInventory = inventory.map(q => {
      if (q.id !== selectedQuality.id) return q;

      const nextStock = Math.max(0, q.stockHuevos + sign * formUnits);
      if (form.tipo !== "entrada") return { ...q, stockHuevos: nextStock };

      const oldStock = Math.max(0, Number(q.stockHuevos || 0));
      const oldUnitCost = Number(q.costoCaja || 0) / EGG_BOX_UNITS;
      const totalCostBefore = oldStock * oldUnitCost;
      const totalCostAfter = totalCostBefore + purchaseTotal;
      const averageUnitCost = nextStock > 0 ? totalCostAfter / nextStock : purchaseUnitValue;

      return {
        ...q,
        stockHuevos: nextStock,
        costoCaja: Math.round(averageUnitCost * EGG_BOX_UNITS),
        precioVentaUnitario: saleUnitValue,
        precioBandeja: Math.round(saleUnitValue * EGG_TRAY_UNITS),
        precioCaja: Math.round(saleUnitValue * EGG_BOX_UNITS),
      };
    });
    const movement = {
      id: Date.now(),
      fechaIngreso: ["entrada", "venta", "merma", "rotos", "trizados"].includes(form.tipo) ? form.fechaIngreso : "",
      fecha: ["venta", "merma", "rotos", "trizados"].includes(form.tipo) && form.fechaIngreso
        ? new Date(`${form.fechaIngreso}T${new Date().toTimeString().slice(0,8)}`).toISOString()
        : new Date().toISOString(),
      tipo: form.tipo,
      calidadId: selectedQuality.id, calidad: selectedQuality.nombre,
      cajas: Number(form.cajas || 0), bandejas: Number(form.bandejas || 0), unidades: Number(form.unidades || 0),
      huevos: formUnits, motivo: form.motivo || "Sin motivo", observaciones: form.observaciones || "",
      usuario: currentUser?.nombre || "Usuario", ingreso, costo, ganancia: ingreso - costo,
      precioCaja: form.tipo === "venta" ? Number(form.precioCaja || 0) : 0,
      precioBandeja: form.tipo === "venta" ? Number(form.precioBandeja || 0) : 0,
      precioUnidad: form.tipo === "venta" ? Number(form.precioUnidad || 0) : 0,
      valorUnitarioCompra: form.tipo === "entrada" ? purchaseUnitValue : 0,
      totalCompra: form.tipo === "entrada" ? purchaseTotal : 0,
      precioVentaUnitario: form.tipo === "entrada" ? saleUnitValue : 0,
      ventaEsperada: form.tipo === "entrada" ? expectedSaleTotal : 0,
      gananciaEstimada: form.tipo === "entrada" ? expectedProfit : 0,
      descuento: form.tipo === "venta" ? saleDiscount : 0,
    };
    try {
      await syncEggState(updatedInventory, movement);
      setShowMovement(false);
    } catch (e) {
      setError(e.message || "No se pudo guardar el movimiento.");
      return;
    }
    setForm({
      tipo: "entrada", calidadId: selectedQuality.id, cajas: "", bandejas: "", unidades: "",
      motivo: "Compra de mercadería", observaciones: "", precioCaja: "", precioBandeja: "",
      precioUnidad: "", descuento: "",
      valorUnitarioCompra: "", totalCompra: "", precioVentaUnitario: "",
      fechaIngreso: todayLocalISO(),
    });
    setUltimoCampoEditado(null);
  };

  const deleteMovement = async (m) => {
    if (!window.confirm(`¿Eliminar este movimiento de "${m.calidad}" (${Number(m.huevos || 0).toLocaleString("es-CL")} huevos)? Esta acción no se puede deshacer.`)) return;
    setError("");
    // Revierte el efecto que tuvo este movimiento sobre el stock: las entradas
    // y ajustes de entrada sumaron, todo lo demás (venta/merma/rotos/trizados/
    // ajuste de salida) restó, así que aplicamos el signo contrario.
    const sign = ["entrada", "ajuste_entrada"].includes(m.tipo) ? 1 : -1;
    const reversedInventory = inventory.map(q => q.id === m.calidadId
      ? { ...q, stockHuevos: Math.max(0, Number(q.stockHuevos || 0) - sign * Number(m.huevos || 0)) }
      : q);
    try {
      const res = await fetch(`${API}/api/huevos/movimientos/${m.id}`, {
        method: "DELETE", headers: eggHeaders,
        body: JSON.stringify({ inventory: reversedInventory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar el movimiento.");
      const nextMovements = data.movements || movements.filter(x => x.id !== m.id);
      const nextInventory = data.inventory || reversedInventory;
      setInventory(nextInventory);
      setMovements(nextMovements);
      saveEggInventory(nextInventory);
      saveEggMovements(nextMovements);
    } catch (e) {
      setError(e.message || "No se pudo eliminar el movimiento.");
    }
  };

  const openEditQuality = q => {
    setEditForm({ ...q });
    setShowEdit(q.id);
  };
  const saveQuality = async () => {
    const next = inventory.map(q => q.id === showEdit ? {
      ...q,
      costoCaja: Math.max(0, Number(editForm.costoCaja || 0)),
      precioCaja: Math.max(0, Number(editForm.precioCaja || 0)),
      precioBandeja: Math.max(0, Number(editForm.precioBandeja || 0)),
      stockMinimoCajas: Math.max(0, Number(editForm.stockMinimoCajas || 0)),
    } : q);
    try {
      const res = await fetch(`${API}/api/huevos/inventario`, {
        method: "PUT", headers: eggHeaders, body: JSON.stringify({ inventory: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar la calidad.");
      setInventory(data.inventory || next);
      saveEggInventory(data.inventory || next);
      setShowEdit(null);
    } catch (e) { setError(e.message || "No se pudo actualizar la calidad."); }
  };

  const totalEggs = inventory.reduce((s, q) => s + Number(q.stockHuevos || 0), 0);
  const totalBreakdown = eggBreakdown(totalEggs);
  const sales = movements.filter(m => m.tipo === "venta");
  const wastes = movements.filter(m => ["merma", "rotos", "trizados"].includes(m.tipo));
  const revenue = sales.reduce((s, m) => s + Number(m.ingreso || 0), 0);
  const profit = sales.reduce((s, m) => s + Number(m.ganancia || 0), 0);
  const wasteUnits = wastes.reduce((s, m) => s + Number(m.huevos || 0), 0);
  const wasteCost = wastes.reduce((s, m) => s + Number(m.costo || 0), 0);
  const inventoryCost = inventory.reduce((s, q) => s + (q.stockHuevos / EGG_BOX_UNITS) * Number(q.costoCaja || 0), 0);
  const inventorySaleValue = inventory.reduce((s, q) => s + (q.stockHuevos / EGG_BOX_UNITS) * Number(q.precioCaja || 0), 0);

  const eggLots = useMemo(() => {
    // Se ordena por el momento REAL de registro (id = Date.now() al crear el
    // movimiento), no por la fecha de ingreso elegida a mano. Antes se mezclaba
    // "fechaIngreso a las 12:00" para entradas con la hora real para el resto,
    // así que una venta registrada la misma mañana podía quedar antes que la
    // entrada del lote de esa tarde y la venta no encontraba lote al cual
    // descontarle stock.
    const chronological = [...movements].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const queues = {};
    const lots = [];

    chronological.forEach(m => {
      const qualityId = m.calidadId || "sin-calidad";
      if (!queues[qualityId]) queues[qualityId] = [];
      const units = Math.max(0, Number(m.huevos || 0));

      if (m.tipo === "entrada") {
        const unitCost = Number(m.valorUnitarioCompra || 0) || (units > 0 ? Number(m.totalCompra || m.costo || 0) / units : 0);
        const lot = {
          id: String(m.id || `${qualityId}-${lots.length}`),
          calidadId: qualityId, calidad: m.calidad || qualityId,
          fechaIngreso: m.fechaIngreso || String(m.fecha || "").slice(0, 10),
          fechaRegistro: m.fecha || "",
          huevosIniciales: units, stockRestante: units, vendidos: 0, merma: 0, rotos: 0, trizados: 0,
          costoUnitario: unitCost, costoTotal: Number(m.totalCompra || m.costo || unitCost * units),
          ingreso: 0, costoVendido: 0, ganancia: 0,
        };
        lots.push(lot);
        queues[qualityId].push(lot);
        return;
      }

      if (!["venta", "merma", "rotos", "trizados", "ajuste_salida"].includes(m.tipo) || units <= 0) return;
      let pending = units;
      const saleUnit = m.tipo === "venta" && units > 0 ? Number(m.ingreso || 0) / units : 0;
      const applyToLot = (lot, taken) => {
        lot.stockRestante -= taken;
        const allocatedCost = taken * lot.costoUnitario;
        if (m.tipo === "venta") {
          const allocatedIncome = taken * saleUnit;
          lot.vendidos += taken;
          lot.ingreso += allocatedIncome;
          lot.costoVendido += allocatedCost;
          lot.ganancia += allocatedIncome - allocatedCost;
        } else if (m.tipo === "rotos") {
          lot.rotos += taken;
        } else if (m.tipo === "trizados") {
          lot.trizados += taken;
        } else {
          lot.merma += taken;
        }
      };
      const lotsForQuality = queues[qualityId] || [];
      // Paso A: si el movimiento tiene una fecha elegida, se descuenta primero
      // del lote que coincide exactamente con esa fecha (así una venta fechada
      // el 21 afecta al lote del 21, no al lote más antiguo por FIFO ciego).
      if (m.fechaIngreso) {
        for (const lot of lotsForQuality) {
          if (pending <= 0) break;
          if (lot.fechaIngreso !== m.fechaIngreso) continue;
          const taken = Math.min(pending, Math.max(0, lot.stockRestante));
          if (taken <= 0) continue;
          applyToLot(lot, taken);
          pending -= taken;
        }
      }
      // Paso B: lo que no se pudo cubrir con el lote de esa fecha (o si no se
      // eligió fecha) se completa por orden de llegada (lote más antiguo primero).
      for (const lot of lotsForQuality) {
        if (pending <= 0) break;
        const taken = Math.min(pending, Math.max(0, lot.stockRestante));
        if (taken <= 0) continue;
        applyToLot(lot, taken);
        pending -= taken;
      }
    });

    return lots.sort((a, b) => {
      const byDate = String(b.fechaIngreso).localeCompare(String(a.fechaIngreso));
      return byDate || Number(b.id) - Number(a.id);
    });
  }, [movements]);

  // Agrupa los lotes (ya calculados por eggLots) por semana calendario y
  // calidad, sumando sus cantidades. Así "Inventario" muestra el stock por
  // semana en vez de un único total que mezcla compras de semanas distintas.
  //
  // Ojo: las compras (lotes) se agrupan por la semana en que se registró ESE
  // LOTE. Pero las ventas/merma/trizados/rotos se agrupan por la semana en
  // que se registró CADA MOVIMIENTO, sin importar de qué lote salió el stock
  // (FIFO). Si no hiciéramos esta separación, una merma de hoy que descontó
  // stock de un lote comprado la semana pasada aparecería en la semana vieja
  // en vez de en la de hoy, que es justo el bug que reportó el usuario.
  const weeklyInventory = useMemo(() => {
    const lotGroups = {};
    eggLots.forEach(lot => {
      const week = getWeekStart(lot.fechaIngreso || String(lot.fechaRegistro || "").slice(0, 10));
      const key = `${week}__${lot.calidadId}`;
      if (!lotGroups[key]) lotGroups[key] = { week, calidadId: lot.calidadId, calidad: lot.calidad, lotesCount: 0, stockRestante: 0, costoTotal: 0 };
      const g = lotGroups[key];
      g.lotesCount += 1;
      g.stockRestante += lot.stockRestante;
      g.costoTotal += lot.costoTotal;
    });

    const activityGroups = {};
    movements.forEach(m => {
      if (!["venta", "merma", "trizados", "rotos"].includes(m.tipo)) return;
      const week = getWeekStart(dayKeyOf(m));
      const key = `${week}__${m.calidadId}`;
      if (!activityGroups[key]) activityGroups[key] = { week, calidadId: m.calidadId, calidad: m.calidad, vendidos: 0, merma: 0, trizados: 0, rotos: 0, ingreso: 0, ganancia: 0 };
      const a = activityGroups[key];
      if (m.tipo === "venta") { a.vendidos += Number(m.huevos || 0); a.ingreso += Number(m.ingreso || 0); a.ganancia += Number(m.ganancia || 0); }
      else if (m.tipo === "merma") a.merma += Number(m.huevos || 0);
      else if (m.tipo === "trizados") a.trizados += Number(m.huevos || 0);
      else if (m.tipo === "rotos") a.rotos += Number(m.huevos || 0);
    });

    const groups = {};
    new Set([...Object.keys(lotGroups), ...Object.keys(activityGroups)]).forEach(key => {
      const l = lotGroups[key], a = activityGroups[key];
      const [week, calidadId] = key.split("__");
      groups[key] = {
        week, calidadId, calidad: (l && l.calidad) || (a && a.calidad),
        lotesCount: l ? l.lotesCount : 0, stockRestante: l ? l.stockRestante : 0, costoTotal: l ? l.costoTotal : 0,
        vendidos: a ? a.vendidos : 0, merma: a ? a.merma : 0, trizados: a ? a.trizados : 0, rotos: a ? a.rotos : 0,
        ingreso: a ? a.ingreso : 0, ganancia: a ? a.ganancia : 0,
      };
    });
    const weeksMap = {};
    Object.values(groups).forEach(g => {
      if (!weeksMap[g.week]) weeksMap[g.week] = [];
      weeksMap[g.week].push(g);
    });
    return Object.keys(weeksMap)
      .sort((a, b) => b.localeCompare(a))
      .map(week => ({ week, items: weeksMap[week].sort((a, b) => a.calidad.localeCompare(b.calidad)) }));
  }, [eggLots]);

  const chartData = inventory.map(q => ({ calidad: q.nombre, stock: q.stockHuevos, ventas: sales.filter(m => m.calidadId === q.id).reduce((s, m) => s + m.huevos, 0), merma: wastes.filter(m => m.calidadId === q.id).reduce((s, m) => s + m.huevos, 0) }));
  const typeLabels = { entrada: "Entrada", venta: "Venta", merma: "Merma", rotos: "Rotos", trizados: "Trizados", ajuste_entrada: "Ajuste +", ajuste_salida: "Ajuste -" };
  const typeColors = { entrada: "#10b981", venta: "#3b5bdb", merma: "#e03131", rotos: "#f03e3e", trizados: "#d6336c", ajuste_entrada: "#8b5cf6", ajuste_salida: "#f59e0b" };

  // ── Movimientos por fecha ──────────────────────────────────────────────
  // Ventana de 7 días para la tira de navegación, centrada en el día elegido.
  const movWindowDays = Array.from({ length: 7 }, (_, i) => shiftDate(movDate, i - 3));
  const dayMovements = movements
    .filter(m => dayKeyOf(m) === movDate)
    .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
  const dayVentas = dayMovements.filter(m => m.tipo === "venta");
  const dayEntradas = dayMovements.filter(m => m.tipo === "entrada");
  const dayMermas = dayMovements.filter(m => m.tipo === "merma");
  const dayTrizados = dayMovements.filter(m => m.tipo === "trizados");
  const dayRotos = dayMovements.filter(m => m.tipo === "rotos");
  const daySummary = [
    { label: "Ventas", count: dayVentas.length, detail: fmt(dayVentas.reduce((s, m) => s + Number(m.ingreso || 0), 0)), color: "#10b981" },
    { label: "Entradas", count: dayEntradas.length, detail: `${dayEntradas.reduce((s, m) => s + Number(m.huevos || 0), 0) / EGG_BOX_UNITS} cajas`, color: "#3b5bdb" },
    { label: "Mermas", count: dayMermas.length, detail: `${dayMermas.reduce((s, m) => s + Number(m.huevos || 0), 0)} huevos`, color: "#e03131" },
    { label: "Trizados", count: dayTrizados.length, detail: `${dayTrizados.reduce((s, m) => s + Number(m.huevos || 0), 0)} huevos`, color: "#d6336c" },
    { label: "Rotos", count: dayRotos.length, detail: `${dayRotos.reduce((s, m) => s + Number(m.huevos || 0), 0)} huevos`, color: "#f03e3e" },
  ];

  // ── Balance del día ─────────────────────────────────────────────────────
  // Ingresos: lo que entró por ventas. Egresos: el costo de lo que se perdió
  // (merma/rotos/trizados), es decir, mercadería que salió del stock sin
  // generar ingreso. Ganancia: ventas menos el costo de lo efectivamente
  // vendido (no incluye la merma, esa ya está en "Egresos").
  const balanceMovements = movements.filter(m => dayKeyOf(m) === balanceDate);
  const balanceVentas = balanceMovements.filter(m => m.tipo === "venta");
  const balanceWastes = balanceMovements.filter(m => ["merma", "rotos", "trizados"].includes(m.tipo));
  const balanceIngresos = balanceVentas.reduce((s, m) => s + Number(m.ingreso || 0), 0);
  const balanceEgresos = balanceWastes.reduce((s, m) => s + Number(m.costo || 0), 0);
  const balanceNeto = balanceIngresos - balanceEgresos;
  const balanceCostoVendido = balanceVentas.reduce((s, m) => s + Number(m.costo || 0), 0);
  const balanceGanancia = balanceIngresos - balanceCostoVendido;

  const tabs = [
    { id: "dashboard", label: "Resumen" }, { id: "inventario", label: "Inventario" },
    { id: "lotes", label: "Lotes por fecha" }, { id: "movimientos", label: "Movimientos" }, { id: "balance", label: "Balance" }, { id: "merma", label: "Merma" }, { id: "estadisticas", label: "Estadísticas" },
  ];

  return <div>
    <div className="page-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:28 }}>🥚</span><h2 style={{ margin:0, fontSize:22, color:textPrimary }}>Control de Huevos</h2></div>
        <p style={{ margin:"4px 0 0", fontSize:13, color:textMuted }}>Stock, ventas, ganancias y merma separados del resto de productos</p>
      </div>
      <button onClick={() => { setShowMovement(true); setError(""); }} className="btn-primary" style={{ padding:"10px 16px", borderRadius:10, display:"flex", alignItems:"center", gap:7 }}><Plus size={15}/> Registrar movimiento</button>
    </div>

    <div style={{ ...card, padding:8, display:"flex", gap:6, marginBottom:18, overflowX:"auto" }}>
      {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:"9px 14px", borderRadius:9, border:"none", cursor:"pointer", whiteSpace:"nowrap", fontWeight:700, fontSize:12, fontFamily:"inherit", background:tab===t.id?"linear-gradient(135deg,#3b5bdb,#4c6ef5)":"transparent", color:tab===t.id?"#fff":textSecondary }}>{t.label}</button>)}
    </div>

    {tab === "dashboard" && <>
      <div className="dashboard-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:16 }}>
        {[
          ["Cajas completas", totalBreakdown.cajas, "📦", "#3b5bdb"],
          ["Bandejas sueltas", totalBreakdown.bandejas, "🥚", "#f59e0b"],
          ["Huevos totales", totalEggs.toLocaleString("es-CL"), "◯", "#10b981"],
          ["Merma acumulada", `${wasteUnits.toLocaleString("es-CL")} huevos`, "⚠️", "#e03131"],
        ].map(([label,value,icon,color]) => <div key={label} style={card} className="card-hover"><div style={{ fontSize:23, marginBottom:10 }}>{icon}</div><p style={{ margin:0, color:textMuted, fontSize:12 }}>{label}</p><p style={{ margin:"5px 0 0", color:textPrimary, fontSize:23, fontWeight:800 }}>{value}</p><div style={{ width:34, height:3, borderRadius:4, background:color, marginTop:12 }}/></div>)}
      </div>
      <div className="dashboard-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:18 }}>
        {[
          ["Ventas huevos", fmt(revenue), "Ingresos exclusivos de huevos", "#10b981"],
          ["Ganancia huevos", fmt(profit), "Sin mezclar otros productos", "#3b5bdb"],
          ["Costo de merma", fmt(wasteCost), "Pérdida al costo", "#e03131"],
          ["Valor inventario", fmt(inventorySaleValue), `Costo: ${fmt(inventoryCost)}`, "#8b5cf6"],
        ].map(([label,value,sub,color]) => <div key={label} style={card}><p style={{ margin:0, color:textMuted, fontSize:12 }}>{label}</p><p style={{ margin:"6px 0 2px", color, fontSize:21, fontWeight:800 }}>{value}</p><p style={{ margin:0, color:textMuted, fontSize:11 }}>{sub}</p></div>)}
      </div>
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <h3 style={{ margin:0, color:textPrimary, fontSize:14 }}>Últimos movimientos de hoy</h3>
          <button onClick={() => { setTab("movimientos"); setMovDate(todayLocalISO()); }} style={{ border:"none", background:"none", color:"#3b5bdb", fontSize:12, fontWeight:700, cursor:"pointer" }}>Ver todos →</button>
        </div>
        {(() => {
          const hoy = todayLocalISO();
          const todaysMovements = movements
            .filter(m => dayKeyOf(m) === hoy)
            .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime())
            .slice(0, 6);
          if (todaysMovements.length === 0) return <p style={{ margin:0, textAlign:"center", padding:"20px 0", color:textMuted, fontSize:12 }}>Todavía no hay movimientos hoy.</p>;
          return todaysMovements.map(m => <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${borderColor}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span className="badge" style={{ background:`${typeColors[m.tipo]}22`, color:typeColors[m.tipo], fontSize:11 }}>{typeLabels[m.tipo]}</span>
              <div><p style={{ margin:0, color:textPrimary, fontWeight:700, fontSize:13 }}>{m.calidad}</p><p style={{ margin:"2px 0 0", color:textMuted, fontSize:11 }}>{m.motivo}</p></div>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ margin:0, color:textSecondary, fontSize:12 }}>{m.fecha ? new Date(m.fecha).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}) : "—"}</p>
              <p style={{ margin:"2px 0 0", color:m.tipo==="venta"?"#10b981":textMuted, fontSize:11, fontWeight:700 }}>{m.tipo==="venta" ? fmt(m.ingreso) : `${m.huevos.toLocaleString("es-CL")} huevos`}</p>
            </div>
          </div>);
        })()}
      </div>
    </>}

    {tab === "inventario" && <>
      <div style={{ ...card, marginBottom:16 }}>
        <p style={{ margin:"0 0 12px", color:textMuted, fontSize:12, fontWeight:700 }}>Configuración por calidad (costo, precio de venta y stock mínimo)</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:10 }}>
          {inventory.map(q => <div key={q.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:10, background:bgCard2 }}>
            <div><p style={{ margin:0, color:textPrimary, fontWeight:700, fontSize:13 }}>{q.nombre}</p><p style={{ margin:"2px 0 0", color:textMuted, fontSize:11 }}>Costo {fmt(q.costoCaja)} · Venta {fmt(q.precioCaja)}</p></div>
            <button onClick={() => openEditQuality(q)} style={{ width:30,height:30,borderRadius:8,border:`1px solid ${borderColor2}`,background:D?"#1a1d2e":"#fff",cursor:"pointer",color:textSecondary }}><Pencil size={13}/></button>
          </div>)}
        </div>
      </div>

      {weeklyInventory.length===0
        ? <div style={card}><div style={{ textAlign:"center",padding:36,color:textMuted }}>Todavía no hay entradas registradas.</div></div>
        : weeklyInventory.map(({ week, items }) => <div key={week} style={{ marginBottom:20 }}>
            <h3 style={{ margin:"0 0 12px", color:textPrimary, fontSize:14 }}>{formatWeekLabel(week)}</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:14 }}>
              {items.map(g => {
                const b = eggBreakdown(g.stockRestante);
                const cardKey = `${week}__${g.calidadId}`;
                const isExpanded = expandedWeekCard === cardKey;
                const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
                const selectedDay = isExpanded ? (expandedWeekDay || week) : null;
                const selectedMovements = selectedDay
                  ? movements
                      .filter(m => dayKeyOf(m) === selectedDay && m.calidadId === g.calidadId)
                      .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime())
                  : [];
                const selectedSummary = selectedMovements.reduce((acc, m) => {
                  const eggs = Number(m.huevos || 0);
                  if (m.tipo === "entrada") acc.entradas += eggs;
                  if (m.tipo === "venta") { acc.vendidos += eggs; acc.ingresos += Number(m.ingreso || 0); acc.ganancia += Number(m.ganancia || 0); }
                  if (m.tipo === "merma") acc.merma += eggs;
                  if (m.tipo === "trizados") acc.trizados += eggs;
                  if (m.tipo === "rotos") acc.rotos += eggs;
                  return acc;
                }, { entradas:0, vendidos:0, merma:0, trizados:0, rotos:0, ingresos:0, ganancia:0 });

                return <div
                  key={g.calidadId}
                  style={{ ...card, cursor:"pointer", outline:isExpanded?"2px solid rgba(59,91,219,.35)":"none" }}
                  className="card-hover"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isExpanded) { setExpandedWeekCard(null); setExpandedWeekDay(null); }
                    else { setExpandedWeekCard(cardKey); setExpandedWeekDay(week); }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
                  }}
                >
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <div><p style={{ margin:0, color:textPrimary, fontSize:16, fontWeight:800 }}>{g.calidad}</p><p style={{ margin:"3px 0 0", color:textMuted, fontSize:11 }}>{g.lotesCount>0 ? `${g.lotesCount} ${g.lotesCount===1?"lote":"lotes"} esta semana` : "Sin compras nuevas esta semana"}</p></div>
                    <ChevronDown size={18} color={textMuted} style={{ transform:isExpanded?"rotate(180deg)":"rotate(0deg)", transition:"transform .2s" }}/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
                    {[["Cajas",b.cajas],["Bandejas",b.bandejas],["Sueltos",b.unidades]].map(([l,v])=><div key={l} style={{ background:bgCard2,borderRadius:10,padding:"10px 8px",textAlign:"center" }}><p style={{ margin:0,color:textMuted,fontSize:10 }}>{l}</p><p style={{ margin:"4px 0 0",color:textPrimary,fontWeight:800,fontSize:18 }}>{v}</p></div>)}
                  </div>
                  <div style={{ borderTop:`1px solid ${borderColor}`, paddingTop:12, display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                    <p style={{ margin:0, color:textSecondary,fontSize:12 }}>Vendidos: <strong style={{color:textPrimary}}>{g.vendidos.toLocaleString("es-CL")}</strong></p>
                    <p style={{ margin:0, color:textSecondary,fontSize:12 }}>Merma: <strong style={{color:"#e03131"}}>{g.merma.toLocaleString("es-CL")}</strong></p>
                    <p style={{ margin:0, color:textSecondary,fontSize:12 }}>Trizados: <strong style={{color:"#d6336c"}}>{g.trizados.toLocaleString("es-CL")}</strong></p>
                    <p style={{ margin:0, color:textSecondary,fontSize:12 }}>Rotos: <strong style={{color:"#f03e3e"}}>{g.rotos.toLocaleString("es-CL")}</strong></p>
                    <p style={{ margin:0, color:textSecondary,fontSize:12 }}>Costo: <strong style={{color:textPrimary}}>{fmt(g.costoTotal)}</strong></p>
                    <p style={{ margin:0, color:textSecondary,fontSize:12 }}>Ganancia: <strong style={{color:g.ganancia>=0?"#10b981":"#e03131"}}>{fmt(g.ganancia)}</strong></p>
                  </div>

                  {isExpanded && <div onClick={e=>e.stopPropagation()} style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${borderColor}` }}>
                    <p style={{ margin:"0 0 10px", color:textPrimary, fontSize:13, fontWeight:800 }}>Movimientos por día</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(62px,1fr))", gap:6, overflowX:"auto", paddingBottom:4 }}>
                      {weekDays.map(day => {
                        const info = formatDayLabel(day);
                        const active = selectedDay === day;
                        const count = movements.filter(m => dayKeyOf(m) === day && m.calidadId === g.calidadId).length;
                        return <button key={day} onClick={()=>setExpandedWeekDay(day)} style={{ minWidth:62, padding:"8px 4px", borderRadius:9, border:`1px solid ${active?"#3b5bdb":borderColor2}`, background:active?"linear-gradient(135deg,#3b5bdb,#4c6ef5)":bgCard2, color:active?"#fff":textSecondary, cursor:"pointer", fontFamily:"inherit" }}>
                          <div style={{ fontSize:10, fontWeight:700 }}>{info.weekday}</div>
                          <div style={{ fontSize:12, fontWeight:800, marginTop:2 }}>{info.dayMonth}</div>
                          <div style={{ fontSize:9, marginTop:3, opacity:.85 }}>{count} mov.</div>
                        </button>;
                      })}
                    </div>

                    <div style={{ marginTop:12, padding:12, borderRadius:10, background:bgCard2 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:10 }}>
                        <p style={{ margin:0, color:textPrimary, fontWeight:800, fontSize:13 }}>{selectedDay ? formatFullDate(selectedDay) : "Selecciona un día"}</p>
                        <span style={{ color:textMuted, fontSize:10 }}>{selectedMovements.length} movimientos</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(95px,1fr))", gap:6, marginBottom:10 }}>
                        {[
                          ["Entradas",selectedSummary.entradas,"#3b5bdb"],
                          ["Vendidos",selectedSummary.vendidos,textPrimary],
                          ["Merma",selectedSummary.merma,"#e03131"],
                          ["Trizados",selectedSummary.trizados,"#d6336c"],
                          ["Rotos",selectedSummary.rotos,"#f03e3e"],
                          ["Ganancia",fmt(selectedSummary.ganancia),selectedSummary.ganancia>=0?"#10b981":"#e03131"],
                        ].map(([label,value,color])=><div key={label} style={{ padding:"8px", borderRadius:8, background:D?"rgba(255,255,255,.04)":"#fff" }}><p style={{ margin:0, color:textMuted, fontSize:9 }}>{label}</p><p style={{ margin:"3px 0 0", color, fontSize:12, fontWeight:800 }}>{typeof value === "number" ? value.toLocaleString("es-CL") : value}</p></div>)}
                      </div>
                      {selectedMovements.length===0
                        ? <p style={{ margin:0, padding:"12px 0", textAlign:"center", color:textMuted, fontSize:11 }}>No hubo movimientos de {g.calidad} este día.</p>
                        : <div style={{ display:"grid", gap:7 }}>
                            {selectedMovements.map(m => { const qty=eggBreakdown(m.huevos); return <div key={m.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:8, background:D?"rgba(255,255,255,.04)":"#fff" }}>
                              <div style={{ minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}><span className="badge" style={{ background:`${typeColors[m.tipo]}22`, color:typeColors[m.tipo], fontSize:9 }}>{typeLabels[m.tipo]}</span><strong style={{ color:textPrimary, fontSize:11 }}>{qty.cajas}c · {qty.bandejas}b · {qty.unidades}u</strong></div>
                                <p style={{ margin:"4px 0 0", color:textMuted, fontSize:10, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.motivo || "Sin motivo"}</p>
                              </div>
                              <div style={{ textAlign:"right", flexShrink:0 }}><p style={{ margin:0, color:textSecondary, fontSize:10 }}>{m.fecha?new Date(m.fecha).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}):"—"}</p><p style={{ margin:"3px 0 0", color:m.tipo==="venta"?"#10b981":textMuted, fontSize:10, fontWeight:800 }}>{m.tipo==="venta"?fmt(m.ingreso):`${Number(m.huevos||0).toLocaleString("es-CL")} huevos`}</p></div>
                            </div>; })}
                          </div>}
                    </div>
                  </div>}
                </div>;
              })}
            </div>
          </div>)}
    </>}

    {tab === "lotes" && <div style={{display:"grid",gap:14}}>
      {eggLots.length===0 ? <div style={card}><div style={{textAlign:"center",padding:36,color:textMuted}}>Todavía no hay lotes registrados. Las nuevas entradas aparecerán separadas por fecha.</div></div> : eggLots.map(lot=>{
        const initial=eggBreakdown(lot.huevosIniciales);
        const remaining=eggBreakdown(lot.stockRestante);
        return <div key={lot.id} style={card} className="card-hover">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:14}}>
            <div><p style={{margin:0,color:textPrimary,fontSize:17,fontWeight:800}}>{lot.calidad}</p><p style={{margin:"4px 0 0",color:textMuted,fontSize:12}}>Ingreso: {lot.fechaIngreso ? new Date(`${lot.fechaIngreso}T12:00:00`).toLocaleDateString("es-CL") : "Sin fecha"}</p></div>
            <span className="badge" style={{background:lot.stockRestante>0?(D?"rgba(16,185,129,.18)":"#ecfdf5"):(D?"rgba(107,114,128,.18)":"#f3f4f6"),color:lot.stockRestante>0?"#10b981":textMuted}}>{lot.stockRestante>0?"Lote activo":"Lote agotado"}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(125px,1fr))",gap:9}}>
            {[
              ["Entrada",`${initial.cajas}c · ${initial.bandejas}b · ${initial.unidades}u`],
              ["Stock restante",`${remaining.cajas}c · ${remaining.bandejas}b · ${remaining.unidades}u`],
              ["Huevos vendidos",Number(lot.vendidos).toLocaleString("es-CL")],
              ["Merma",Number(lot.merma).toLocaleString("es-CL")],
              ["Rotos",Number(lot.rotos).toLocaleString("es-CL")],
              ["Trizados",Number(lot.trizados).toLocaleString("es-CL")],
              ["Costo del lote",fmt(lot.costoTotal)],
              ["Ingresos",fmt(lot.ingreso)],
              ["Ganancia",fmt(lot.ganancia)],
            ].map(([label,value])=><div key={label} style={{background:bgCard2,borderRadius:10,padding:"11px 10px"}}><p style={{margin:0,color:textMuted,fontSize:10}}>{label}</p><p style={{margin:"5px 0 0",color:label==="Ganancia"?(lot.ganancia>=0?"#10b981":"#e03131"):(label==="Rotos"||label==="Trizados"||label==="Merma")?"#e03131":textPrimary,fontWeight:800,fontSize:14}}>{value}</p></div>)}
          </div>
        </div>;
      })}
    </div>}

    {tab === "movimientos" && <>
      <div style={{...card, marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setMovDate(shiftDate(movDate,-1))} style={{width:34,height:34,minWidth:34,borderRadius:9,border:`1px solid ${borderColor2}`,background:bgCard2,cursor:"pointer",color:textSecondary,display:"flex",alignItems:"center",justifyContent:"center"}}><ChevronLeft size={16}/></button>
          <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
            {movWindowDays.map(d => { const { dayMonth, weekday } = formatDayLabel(d); const selected = d === movDate; return (
              <button key={d} onClick={()=>setMovDate(d)} style={{padding:"9px 4px",borderRadius:10,border:"none",cursor:"pointer",textAlign:"center",background:selected?"linear-gradient(135deg,#3b5bdb,#4c6ef5)":bgCard2,color:selected?"#fff":textSecondary}}>
                <div style={{fontSize:12,fontWeight:700}}>{dayMonth}</div>
                <div style={{fontSize:10,marginTop:2,opacity:.85}}>{weekday}</div>
              </button>
            );})}
          </div>
          <button onClick={()=>setMovDate(shiftDate(movDate,1))} style={{width:34,height:34,minWidth:34,borderRadius:9,border:`1px solid ${borderColor2}`,background:bgCard2,cursor:"pointer",color:textSecondary,display:"flex",alignItems:"center",justifyContent:"center"}}><ChevronRight size={16}/></button>
        </div>
      </div>

      <div className="dashboard-grid" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:16}}>
        {daySummary.map(s => <div key={s.label} style={card}><p style={{margin:0,color:textMuted,fontSize:12}}>{s.label}</p><p style={{margin:"6px 0 2px",color:s.color,fontSize:20,fontWeight:800}}>{s.count}</p><p style={{margin:0,color:textMuted,fontSize:11}}>{s.detail}</p></div>)}
      </div>

      <div style={card}>
        <p style={{margin:"0 0 14px",color:textMuted,fontSize:12}}>Movimientos del {formatFullDate(movDate)}</p>
        {dayMovements.length===0
          ? <div style={{ textAlign:"center",padding:36,color:textMuted }}>No hay movimientos en esta fecha.</div>
          : <div className="table-scroll"><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}><thead><tr>{["Hora","Tipo","Categoría","Cantidad","Motivo","Ingreso","Ganancia","Usuario",""].map(h=><th key={h} style={{ textAlign:"left",padding:"10px 8px",color:textMuted,borderBottom:`1px solid ${borderColor}` }}>{h}</th>)}</tr></thead><tbody>{dayMovements.map(m=>{const b=eggBreakdown(m.huevos);return <tr key={m.id}><td style={{padding:"11px 8px",color:textSecondary,borderBottom:`1px solid ${borderColor}`}}>{m.fecha?new Date(m.fecha).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}):"—"}</td><td style={{padding:"11px 8px",borderBottom:`1px solid ${borderColor}`}}><span className="badge" style={{background:`${typeColors[m.tipo]}22`,color:typeColors[m.tipo]}}>{typeLabels[m.tipo]}</span></td><td style={{padding:"11px 8px",borderBottom:`1px solid ${borderColor}`}}><span className="badge" style={{background:D?"rgba(255,255,255,.08)":"#f1f3f5",color:textPrimary,fontWeight:700}}>{m.calidad}</span></td><td style={{padding:"11px 8px",color:textSecondary,borderBottom:`1px solid ${borderColor}`}}>{b.cajas}c · {b.bandejas}b · {b.unidades}u</td><td style={{padding:"11px 8px",color:textSecondary,borderBottom:`1px solid ${borderColor}`}}>{m.motivo}</td><td style={{padding:"11px 8px",color:"#10b981",fontWeight:700,borderBottom:`1px solid ${borderColor}`}}>{m.ingreso?fmt(m.ingreso):"—"}</td><td style={{padding:"11px 8px",color:m.ganancia>=0?"#3b5bdb":"#e03131",fontWeight:700,borderBottom:`1px solid ${borderColor}`}}>{m.tipo==="venta"?fmt(m.ganancia):"—"}</td><td style={{padding:"11px 8px",color:textMuted,borderBottom:`1px solid ${borderColor}`}}>{m.usuario}</td><td style={{padding:"11px 8px",borderBottom:`1px solid ${borderColor}`}}><button onClick={()=>deleteMovement(m)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#e03131",display:"flex"}} title="Eliminar movimiento"><Trash2 size={14}/></button></td></tr>})}</tbody></table></div>}
      </div>
    </>}

    {tab === "balance" && <>
      <div style={{ ...card, marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={() => setBalanceDate(shiftDate(balanceDate, -1))} style={{ background:"none", border:"none", cursor:"pointer", color:textSecondary, fontSize:13, fontWeight:600 }}>{formatDayLabel(shiftDate(balanceDate, -1)).dayMonth}</button>
        <div style={{ flex:1 }} />
        <div style={{ padding:"8px 18px", borderRadius:10, background:"linear-gradient(135deg,#3b5bdb,#4c6ef5)", color:"#fff", fontWeight:800, fontSize:14 }}>{formatDayLabel(balanceDate).dayMonth}</div>
        <button onClick={() => setBalanceDate(shiftDate(balanceDate, 1))} style={{ width:32,height:32,borderRadius:9,border:`1px solid ${borderColor2}`,background:bgCard2,cursor:"pointer",color:textSecondary,display:"flex",alignItems:"center",justifyContent:"center" }}><ChevronRight size={15}/></button>
      </div>

      <div style={{ ...card, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:6, color:textMuted, fontSize:12 }}><TrendingUp size={14} color="#10b981"/> Ingresos</div>
            <p style={{ margin:"6px 0 0", color:textPrimary, fontSize:22, fontWeight:800 }}>{fmt(balanceIngresos)}</p>
          </div>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:6, color:textMuted, fontSize:12 }}><TrendingDown size={14} color="#e03131"/> Egresos (merma)</div>
            <p style={{ margin:"6px 0 0", color:textPrimary, fontSize:22, fontWeight:800 }}>{balanceEgresos>0?`-${fmt(balanceEgresos)}`:fmt(0)}</p>
          </div>
        </div>
        <div style={{ borderTop:`1px solid ${borderColor}`, marginTop:16, paddingTop:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ color:textSecondary, fontSize:13 }}>Balance</span>
          <strong style={{ color:balanceNeto>=0?"#10b981":"#e03131", fontSize:20 }}>{fmt(balanceNeto)}</strong>
        </div>
      </div>

      <div style={{ ...card, marginBottom:16 }}>
        <div onClick={() => setShowGananciaDetail(v => !v)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
          <h3 style={{ margin:0, color:textPrimary, fontSize:15 }}>Ganancia</h3>
          <ChevronDown size={16} color={textMuted} style={{ transform:showGananciaDetail?"rotate(180deg)":"none", transition:"transform .15s" }}/>
        </div>
        {showGananciaDetail && <div style={{ marginTop:14 }}>
          <p style={{ margin:"0 0 14px", color:textMuted, fontSize:12, lineHeight:1.5 }}>Se calcula restando de tus ventas de huevos el costo de esos huevos (según el costo por caja registrado en cada lote).</p>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}><span style={{ color:textSecondary, fontSize:13 }}>Ventas</span><strong style={{ color:textPrimary, fontSize:13 }}>{fmt(balanceIngresos)}</strong></div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}><span style={{ color:textSecondary, fontSize:13 }}>Costo de los huevos que vendiste</span><strong style={{ color:"#e03131", fontSize:13 }}>-{fmt(balanceCostoVendido)}</strong></div>
          <div style={{ borderTop:`1px solid ${borderColor}`, marginTop:8, paddingTop:12, display:"flex", justifyContent:"space-between" }}><strong style={{ color:textPrimary, fontSize:14 }}>Ganancia estimada</strong><strong style={{ color:balanceGanancia>=0?"#10b981":"#e03131", fontSize:16 }}>{fmt(balanceGanancia)}</strong></div>
        </div>}
      </div>

      <div style={{ ...card, textAlign:"center", color:textMuted, fontSize:12, lineHeight:1.6 }}>
        Todavía no se registra el método de pago (efectivo / tarjeta) en las ventas de huevos, así que ese desglose no se puede mostrar aquí. Si quieres, puedo agregar ese campo al formulario de venta para habilitarlo.
      </div>
    </>}

    {tab === "merma" && <><div className="dashboard-grid" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:16 }}>{[["Huevos perdidos",wasteUnits.toLocaleString("es-CL")],["Costo perdido",fmt(wasteCost)],["% sobre salidas",`${((wasteUnits/(wasteUnits+sales.reduce((s,m)=>s+m.huevos,0)||1))*100).toFixed(1)}%`]].map(([l,v])=><div key={l} style={card}><p style={{margin:0,color:textMuted,fontSize:12}}>{l}</p><p style={{margin:"6px 0 0",color:"#e03131",fontWeight:800,fontSize:22}}>{v}</p></div>)}</div><div style={card}>{wastes.length===0?<p style={{margin:0,textAlign:"center",padding:28,color:textMuted}}>No hay merma registrada.</p>:wastes.map((m,i)=><div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<wastes.length-1?`1px solid ${borderColor}`:"none"}}><div style={{width:38,height:38,borderRadius:10,background:D?"rgba(224,49,49,.18)":"#fff1f2",display:"flex",alignItems:"center",justifyContent:"center"}}><TrendingDown size={17} color="#e03131"/></div><div style={{flex:1}}><p style={{margin:0,color:textPrimary,fontWeight:700,fontSize:13}}>{m.calidad} · {m.huevos} huevos</p><p style={{margin:"3px 0 0",color:textMuted,fontSize:11}}>{m.motivo} · {new Date(m.fecha).toLocaleString("es-CL")}</p></div><strong style={{color:"#e03131",fontSize:13}}>{fmt(m.costo)}</strong></div>)}</div></>}

    {tab === "estadisticas" && <div className="dashboard-charts" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><div style={card}><h3 style={{margin:"0 0 16px",color:textPrimary,fontSize:14}}>Ventas y merma por calidad</h3><ResponsiveContainer width="100%" height={280}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={borderColor}/><XAxis dataKey="calidad" tick={{fill:textMuted,fontSize:11}}/><YAxis tick={{fill:textMuted,fontSize:11}}/><Tooltip contentStyle={{background:D?"#1a1d2e":"#fff",border:`1px solid ${borderColor}`,borderRadius:10}}/><Bar dataKey="ventas" fill="#3b5bdb" radius={[5,5,0,0]}/><Bar dataKey="merma" fill="#e03131" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div><div style={card}><h3 style={{margin:"0 0 16px",color:textPrimary,fontSize:14}}>Rentabilidad por calidad</h3>{inventory.map(q=>{const qSales=sales.filter(m=>m.calidadId===q.id);const qRev=qSales.reduce((s,m)=>s+m.ingreso,0);const qProfit=qSales.reduce((s,m)=>s+m.ganancia,0);return <div key={q.id} style={{padding:"12px 0",borderBottom:`1px solid ${borderColor}`}}><div style={{display:"flex",justifyContent:"space-between"}}><strong style={{color:textPrimary,fontSize:13}}>{q.nombre}</strong><strong style={{color:"#10b981",fontSize:13}}>{fmt(qProfit)}</strong></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:textMuted,fontSize:11}}>Ventas {fmt(qRev)}</span><span style={{color:textMuted,fontSize:11}}>{qRev>0?`${((qProfit/qRev)*100).toFixed(1)}% margen`:"Sin ventas"}</span></div></div>})}</div></div>}

    {showMovement && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250,backdropFilter:"blur(5px)"}}><div className="mobile-modal" style={{...card,width:520,maxHeight:"90vh",overflowY:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div><h3 style={{margin:0,color:textPrimary,fontSize:18}}>Registrar movimiento de huevos</h3><p style={{margin:"4px 0 0",color:textMuted,fontSize:12}}>Las cantidades se convierten automáticamente</p></div><button onClick={()=>setShowMovement(false)} style={{border:"none",background:bgCard2,color:textMuted,width:32,height:32,borderRadius:8,cursor:"pointer"}}><X size={15}/></button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label style={{fontSize:12,color:textSecondary,fontWeight:700}}>Tipo<select value={form.tipo} onChange={e=>{
  const tipo=e.target.value;
  setUltimoCampoEditado(null);
  setForm({
    ...form,
    tipo,
    motivo:tipo==="merma"?"Merma":tipo==="rotos"?"Huevos rotos":tipo==="trizados"?"Huevos trizados":tipo==="venta"?"Venta":"Compra de mercadería",
    precioCaja:tipo==="venta"?String(selectedQuality?.precioCaja||0):"",
    precioBandeja:tipo==="venta"?String(selectedQuality?.precioBandeja||0):"",
    precioUnidad:tipo==="venta"?String((Number(selectedQuality?.precioBandeja||0)/EGG_TRAY_UNITS).toFixed(0)):"",
    descuento:"",
    valorUnitarioCompra:tipo==="entrada"?form.valorUnitarioCompra:"",
    totalCompra:tipo==="entrada"?form.totalCompra:"",
    precioVentaUnitario:tipo==="entrada"?String(selectedQuality?.precioVentaUnitario||0):"",
    fechaIngreso:form.fechaIngreso||todayLocalISO(),
  });
}} style={{...inp,marginTop:6}}><option value="entrada">Entrada</option><option value="venta">Venta</option><option value="merma">Merma</option><option value="rotos">Rotos</option><option value="trizados">Trizados</option><option value="ajuste_entrada">Ajuste de entrada</option><option value="ajuste_salida">Ajuste de salida</option></select></label><label style={{fontSize:12,color:textSecondary,fontWeight:700}}>Calidad<select value={form.calidadId} onChange={e=>{
  const calidadId=e.target.value;
  const calidad=inventory.find(q=>q.id===calidadId);
  setForm({
    ...form,
    calidadId,
    ...(form.tipo==="venta"?{
      precioCaja:String(calidad?.precioCaja||0),
      precioBandeja:String(calidad?.precioBandeja||0),
      precioUnidad:String((Number(calidad?.precioBandeja||0)/EGG_TRAY_UNITS).toFixed(0)),
    }:{}),
  });
}} style={{...inp,marginTop:6}}>{inventory.map(q=><option key={q.id} value={q.id}>{q.nombre}</option>)}</select></label></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginTop:12}}>{[["Cajas","cajas"],["Bandejas","bandejas"],["Huevos sueltos","unidades"]].map(([l,k])=><label key={k} style={{fontSize:12,color:textSecondary,fontWeight:700}}>{l}<input type="number" min="0" value={form[k]} onChange={e=>updateEggQuantity(k,e.target.value)} style={{...inp,marginTop:6}}/></label>)}</div><div style={{marginTop:12,padding:12,borderRadius:10,background:bgCard2,color:textSecondary,fontSize:12}}>Total del movimiento: <strong style={{color:textPrimary}}>{formUnits.toLocaleString("es-CL")} huevos</strong> · Stock actual: {selectedQuality?.stockHuevos.toLocaleString("es-CL")}</div>{form.tipo==="entrada"&&<div style={{marginTop:12,padding:14,borderRadius:12,background:D?"rgba(59,91,219,.12)":"#f0f4ff",border:`1.5px solid ${D?"#3b5bdb55":"#bac8ff"}`}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><DollarSign size={16} color="#3b5bdb"/><strong style={{color:textPrimary,fontSize:13}}>Valor unitario y costo de compra</strong></div><p style={{margin:"0 0 12px",color:textMuted,fontSize:11}}>Cada entrada se guardará como un lote independiente y las ventas descontarán primero del lote más antiguo.</p><label style={{display:"block",marginBottom:12,fontSize:11,color:textSecondary,fontWeight:700}}>Fecha de ingreso del lote<input type="date" value={form.fechaIngreso} onChange={e=>setForm({...form,fechaIngreso:e.target.value})} style={{...inp,marginTop:6}}/></label><div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}><label style={{fontSize:11,color:textSecondary,fontWeight:700}}>Valor unitario del huevo<input type="number" min="0" step="0.01" placeholder="Ej: 205" value={form.valorUnitarioCompra} onChange={e=>updatePurchaseUnit(e.target.value)} style={{...inp,marginTop:6}}/></label><label style={{fontSize:11,color:textSecondary,fontWeight:700}}>Precio total de compra<input type="number" min="0" step="1" placeholder="Ej: 959400" value={form.totalCompra} onChange={e=>updatePurchaseTotal(e.target.value)} style={{...inp,marginTop:6}}/></label><label style={{fontSize:11,color:textSecondary,fontWeight:700}}>Precio de venta unitario<input type="number" min="0" step="1" placeholder="Ej: 260" value={form.precioVentaUnitario} onChange={e=>updateSaleUnitPrice(e.target.value)} style={{...inp,marginTop:6}}/></label></div>{formUnits>0&&purchaseTotal>0&&saleUnitValue>0&&<div style={{marginTop:12,padding:"10px 12px",borderRadius:10,background:D?"#1e2235":"#fff",display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,color:textSecondary,fontSize:11}}><div><span>{formUnits.toLocaleString("es-CL")} huevos × {fmt(purchaseUnitValue)}</span><strong style={{display:"block",marginTop:4,color:textPrimary}}>{fmt(purchaseTotal)} (Costo)</strong></div><div><span>{formUnits.toLocaleString("es-CL")} huevos × {fmt(saleUnitValue)}</span><strong style={{display:"block",marginTop:4,color:textPrimary}}>{fmt(expectedSaleTotal)} (Venta esperada)</strong></div><div><span>Ganancia por huevo: <strong>{fmt(saleUnitValue-purchaseUnitValue)}</strong></span><strong style={{display:"block",marginTop:4,color:expectedProfit>=0?"#10b981":"#e03131"}}>Ganancia estimada: {fmt(expectedProfit)}</strong><span style={{display:"block",marginTop:4,color:"#3b82f6"}}>Margen: {expectedMargin.toFixed(2)}%</span></div></div>}</div>}{form.tipo==="venta"&&<div style={{marginTop:12,padding:14,borderRadius:12,background:D?"rgba(59,91,219,.12)":"#f0f4ff",border:`1.5px solid ${D?"#3b5bdb55":"#bac8ff"}`}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><DollarSign size={16} color="#3b5bdb"/><strong style={{color:textPrimary,fontSize:13}}>Datos de la venta</strong></div><label style={{display:"block",marginBottom:12,fontSize:11,color:textSecondary,fontWeight:700}}>Fecha del movimiento<input type="date" value={form.fechaIngreso} onChange={e=>setForm({...form,fechaIngreso:e.target.value})} style={{...inp,marginTop:6}}/></label><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>{[["Precio por caja","precioCaja"],["Precio por bandeja","precioBandeja"]].map(([l,k])=><label key={k} style={{fontSize:11,color:textSecondary,fontWeight:700}}>{l}<input type="number" min="0" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={{...inp,marginTop:6}}/></label>)}</div><div style={{marginTop:10}}><label style={{display:"block",fontSize:11,color:textSecondary,fontWeight:700}}>Descuento<input type="number" min="0" value={form.descuento} onChange={e=>setForm({...form,descuento:e.target.value})} style={{...inp,marginTop:6}}/></label></div><div style={{marginTop:12,padding:"12px 14px",borderRadius:10,background:D?"#1e2235":"#fff",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><p style={{margin:0,color:textMuted,fontSize:11}}>Subtotal: {fmt(saleGross)}{saleDiscount>0?` · Descuento: -${fmt(saleDiscount)}`:""}</p><p style={{margin:"4px 0 0",color:textPrimary,fontSize:13,fontWeight:700}}>Total de la venta</p></div><strong style={{fontSize:22,color:"#10b981"}}>{fmt(saleTotal)}</strong></div></div>}{["merma","rotos","trizados"].includes(form.tipo)&&<div style={{marginTop:12,padding:14,borderRadius:12,background:D?"rgba(224,49,49,.12)":"#fff1f2",border:`1.5px solid ${D?"#e0313155":"#ffc9c9"}`}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><TrendingDown size={16} color="#e03131"/><strong style={{color:textPrimary,fontSize:13}}>{form.tipo==="rotos"?"Datos de huevos rotos":form.tipo==="trizados"?"Datos de huevos trizados":"Datos de la merma"}</strong></div><label style={{display:"block",marginBottom:12,fontSize:11,color:textSecondary,fontWeight:700}}>Fecha del movimiento<input type="date" value={form.fechaIngreso} onChange={e=>setForm({...form,fechaIngreso:e.target.value})} style={{...inp,marginTop:6}}/></label><label style={{display:"block",fontSize:11,color:textSecondary,fontWeight:700,marginBottom:6}}>Motivo rápido</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{[form.tipo==="rotos"?"Huevos rotos":form.tipo==="trizados"?"Huevos trizados":"Merma","Otro"].map(op=><button key={op} type="button" onClick={()=>setForm(f=>({...f,motivo:op}))} style={{padding:"6px 12px",borderRadius:20,border:`1.5px solid ${form.motivo===op?"#e03131":borderColor2}`,background:form.motivo===op?(D?"rgba(224,49,49,.18)":"#ffe3e3"):bgCard2,color:form.motivo===op?"#e03131":textSecondary,fontSize:12,fontWeight:700,cursor:"pointer"}}>{op}</button>)}</div></div>}<label style={{display:"block",marginTop:12,fontSize:12,color:textSecondary,fontWeight:700}}>Motivo<input value={form.motivo} onChange={e=>setForm({...form,motivo:e.target.value})} style={{...inp,marginTop:6}}/></label><label style={{display:"block",marginTop:12,fontSize:12,color:textSecondary,fontWeight:700}}>Observaciones<textarea value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})} style={{...inp,marginTop:6,minHeight:70,resize:"vertical"}}/></label>{error&&<p style={{margin:"10px 0 0",color:"#e03131",fontSize:12,fontWeight:700}}>{error}</p>}<div style={{display:"flex",gap:10,marginTop:18}}><button onClick={()=>setShowMovement(false)} style={{flex:1,padding:11,borderRadius:10,border:`1px solid ${borderColor2}`,background:bgCard2,color:textSecondary,cursor:"pointer",fontWeight:700}}>Cancelar</button><button onClick={registerMovement} className="btn-primary" style={{flex:1,padding:11,borderRadius:10}}>{form.tipo==="venta"?"Registrar venta":"Guardar movimiento"}</button></div></div></div>}

    {showEdit && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}}><div className="mobile-modal" style={{...card,width:430}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:textPrimary}}>Configurar {editForm.nombre}</h3><button onClick={()=>setShowEdit(null)} style={{border:"none",background:bgCard2,color:textMuted,width:32,height:32,borderRadius:8,cursor:"pointer"}}><X size={15}/></button></div>{[["Costo por caja","costoCaja"],["Precio venta por caja","precioCaja"],["Precio venta por bandeja","precioBandeja"],["Stock mínimo (cajas)","stockMinimoCajas"]].map(([l,k])=><label key={k} style={{display:"block",marginBottom:12,fontSize:12,color:textSecondary,fontWeight:700}}>{l}<input type="number" min="0" value={editForm[k]} onChange={e=>setEditForm({...editForm,[k]:e.target.value})} style={{...inp,marginTop:6}}/></label>)}<button onClick={saveQuality} className="btn-primary" style={{width:"100%",padding:11,borderRadius:10}}>Guardar configuración</button></div></div>}
  </div>;
}

// ─── App Principal ────────────────────────────────────────────────────────────
