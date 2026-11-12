// ========================================
// CONFIGURAÇÃO DO SUPABASE
// ========================================

// ========================================
// CONFIGURAÇÃO DO SUPABASE
// ========================================

const SUPABASE_URL = "https://ypwcthtirhdgynehkbaz.supabase.co";

const SUPABASE_KEY = "sb_publishable_nGtLr-kLWpgzkfbQjzXtyA_QZygxZ89";

const LOGIN_DOMAIN = "acesso.dashboard.app";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentUser = null;
let orders = [];
let products = [];
let customers = [];
let expenses = [];
let salesChart = null;
let financeChart = null;

const $ = id => document.getElementById(id);

const money = value =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[char]));

function usernameToEmail(username) {
  const clean = username.trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,30}$/.test(clean)) {
    throw new Error("Use um nome de usuário de 3 a 30 caracteres, sem espaços.");
  }

  return `${clean}@${LOGIN_DOMAIN}`;
}

// ========================================
// LOGIN
// ========================================

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginButton");
  const message = $("loginMessage");

  button.disabled = true;
  button.textContent = "Entrando...";
  message.textContent = "";

  try {
    const username = $("username").value.trim().toLowerCase();
    const password = $("password").value;

    const email = usernameToEmail(username);

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    await db.from("profiles").upsert({
      id: currentUser.id,
      username
    });

    await openDashboard(username);

  } catch (error) {
    message.textContent =
      error.message === "Invalid login credentials"
        ? "Usuário ou senha incorretos."
        : error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Entrar na plataforma <span>→</span>';
  }
});

async function openDashboard(username) {
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");

  $("sidebarUsername").textContent = username;
  $("userAvatar").textContent = username.charAt(0).toUpperCase();
  $("topAvatar").textContent = username.charAt(0).toUpperCase();

  $("currentDate").textContent = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  await loadAll();
}

$("logoutButton").addEventListener("click", async () => {
  await db.auth.signOut();

  currentUser = null;
  $("app").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("loginForm").reset();
});

// Restaura a sessão caso a página seja atualizada.
async function checkSession() {
  const { data } = await db.auth.getSession();

  if (data.session) {
    currentUser = data.session.user;

    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", currentUser.id)
      .maybeSingle();

    const username = profile?.username ||
      currentUser.email.split("@")[0];

    await openDashboard(username);
  }
}

// ========================================
// NAVEGAÇÃO
// ========================================

const pageNames = {
  dashboard: "Visão geral",
  orders: "Pedidos",
  products: "Produtos",
  customers: "Clientes",
  finance: "Financeiro"
};

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  $(page + "Page").classList.remove("hidden");
  $("pageTitle").textContent = pageNames[page];

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });
}

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

document.querySelectorAll("[data-goto]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.goto);
  });
});

// ========================================
// CARREGAMENTO DO BANCO
// ========================================

async function loadAll() {
  if (!currentUser) return;

  const tables = [
    ["orders", "orders"],
    ["products", "products"],
    ["customers", "customers"],
    ["expenses", "expenses"]
  ];

  try {
    for (const [table, variable] of tables) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (variable === "orders") orders = data;
      if (variable === "products") products = data;
      if (variable === "customers") customers = data;
      if (variable === "expenses") expenses = data;
    }

    renderAll();

  } catch (error) {
    alert("Erro ao carregar informações: " + error.message);
  }
}

// ========================================
// DASHBOARD E INDICADORES
// ========================================

function renderAll() {
  renderDashboard();
  renderOrders();
  renderProducts();
  renderCustomers();
  renderExpenses();
  renderCharts();
}

function renderDashboard() {
  const validOrders = orders.filter(o => o.status !== "Cancelado");

  const revenue = validOrders.reduce(
    (sum, order) => sum + Number(order.amount), 0
  );

  const costs = validOrders.reduce((sum, order) => {
    const product = products.find(
      p => p.name.toLowerCase() === order.product.toLowerCase()
    );

    return sum + (Number(product?.cost || 0));
  }, 0);

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount), 0
  );

  const profit = revenue - costs - totalExpenses;

  $("revenue").textContent = money(revenue);
  $("profit").textContent = money(profit);
  $("orderCount").textContent = orders.length;
  $("productCount").textContent = products.length;

  $("financeTotal").textContent = money(revenue);
  $("legendRevenue").textContent = money(revenue);
  $("legendExpenses").textContent = money(totalExpenses);

  $("recentOrders").innerHTML = validOrders
    .slice(0, 5)
    .map(order => `
      <tr>
        <td>${safe(order.customer)}</td>
        <td>${safe(order.product)}</td>
        <td>${money(order.amount)}</td>
        <td><span class="status">${safe(order.status)}</span></td>
      </tr>
    `).join("");

  $("ordersEmpty").classList.toggle("hidden", validOrders.length > 0);
}

// ========================================
// PEDIDOS
// ========================================

$("orderForm").addEventListener("submit", async event => {
  event.preventDefault();

const record = {
  user_id: currentUser.id,
  customer: $("orderCustomer").value.trim(),
  product: $("orderProduct").value.trim(),
  amount: Number($("orderAmount").value),
  status: $("orderStatus").value,
  country: $("orderCountry").value
};

  await insertRecord("orders", record, event.target);
});

function renderOrders() {
  const query = ($("orderSearch")?.value || "").toLowerCase();

  const filtered = orders.filter(order =>
    order.customer.toLowerCase().includes(query) ||
    order.product.toLowerCase().includes(query)
  );

  $("ordersTable").innerHTML = filtered.map(order => `
    <tr>
      <td>${safe(order.customer)}</td>
      <td>${safe(order.product)}</td>
      <td>${money(order.amount)}</td>
      <td><span class="status">${safe(order.status)}</span></td>
      <td><button class="delete-button" onclick="deleteRecord('orders','${order.id}')">Excluir</button></td>
    </tr>
  `).join("");

  $("ordersPageEmpty").classList.toggle("hidden", filtered.length > 0);
}

$("orderSearch").addEventListener("input", renderOrders);

// ========================================
// PRODUTOS
// ========================================

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();

  const record = {
    user_id: currentUser.id,
    name: $("productName").value.trim(),
    cost: Number($("productCost").value),
    price: Number($("productPrice").value),
    stock: Number($("productStock").value)
  };

  await insertRecord("products", record, event.target);
});

function renderProducts() {
  $("productsTable").innerHTML = products.map(product => `
    <tr>
      <td>${safe(product.name)}</td>
      <td>${money(product.cost)}</td>
      <td>${money(product.price)}</td>
      <td>${product.stock}</td>
      <td><button class="delete-button" onclick="deleteRecord('products','${product.id}')">Excluir</button></td>
    </tr>
  `).join("");

  $("productsEmpty").classList.toggle("hidden", products.length > 0);
}

// ========================================
// CLIENTES
// ========================================

$("customerForm").addEventListener("submit", async event => {
  event.preventDefault();

  const record = {
    user_id: currentUser.id,
    name: $("customerName").value.trim(),
    email: $("customerEmail").value.trim() || null
  };

  await insertRecord("customers", record, event.target);
});

function renderCustomers() {
  $("customersTable").innerHTML = customers.map(customer => `
    <tr>
      <td>${safe(customer.name)}</td>
      <td>${safe(customer.email || "—")}</td>
      <td>${new Date(customer.created_at).toLocaleDateString("pt-BR")}</td>
      <td><button class="delete-button" onclick="deleteRecord('customers','${customer.id}')">Excluir</button></td>
    </tr>
  `).join("");

  $("customersEmpty").classList.toggle("hidden", customers.length > 0);
}

// ========================================
// DESPESAS
// ========================================

$("expenseForm").addEventListener("submit", async event => {
  event.preventDefault();

  const record = {
    user_id: currentUser.id,
    description: $("expenseDescription").value.trim(),
    amount: Number($("expenseAmount").value)
  };

  await insertRecord("expenses", record, event.target);
});

function renderExpenses() {
  $("expensesTable").innerHTML = expenses.map(expense => `
    <tr>
      <td>${safe(expense.description)}</td>
      <td>${money(expense.amount)}</td>
      <td>${new Date(expense.created_at).toLocaleDateString("pt-BR")}</td>
      <td><button class="delete-button" onclick="deleteRecord('expenses','${expense.id}')">Excluir</button></td>
    </tr>
  `).join("");

  $("expensesEmpty").classList.toggle("hidden", expenses.length > 0);
}

// ========================================
// OPERAÇÕES DO BANCO
// ========================================

async function insertRecord(table, record, form) {
  try {
    const { error } = await db.from(table).insert(record);

    if (error) throw error;

    form.reset();
    await loadAll();

  } catch (error) {
    alert("Não foi possível salvar: " + error.message);
  }
}

async function deleteRecord(table, id) {
  if (!confirm("Tem certeza que deseja excluir este registro?")) return;

  const { error } = await db
    .from(table)
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }

  await loadAll();
}

// ========================================
// GRÁFICOS
// ========================================

function renderCharts() {
  const labels = [];
  const values = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const key = date.toLocaleDateString("pt-BR");

    labels.push(key.slice(0, 5));

    const total = orders
      .filter(order =>
        order.status !== "Cancelado" &&
        new Date(order.created_at).toLocaleDateString("pt-BR") === key
      )
      .reduce((sum, order) => sum + Number(order.amount), 0);

    values.push(total);
  }

  const salesCanvas = $("salesChart");
  const financeCanvas = $("financeChart");

  if (salesChart) salesChart.destroy();
  if (financeChart) financeChart.destroy();

  salesChart = new Chart(salesCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Faturamento",
        data: values,
        borderColor: "#16a36a",
        backgroundColor: "rgba(22,163,106,.10)",
        fill: true,
        tension: .42,
        borderWidth: 3,
        pointRadius: 3,
        pointBackgroundColor: "#16a36a"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1200, easing: "easeOutQuart" },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#91a399" } },
        y: {
          beginAtZero: true,
          grid: { color: "#edf3ef" },
          ticks: {
            color: "#91a399",
            callback: value => "R$ " + value
          }
        }
      }
    }
  });

  const revenue = orders
    .filter(o => o.status !== "Cancelado")
    .reduce((sum, o) => sum + Number(o.amount), 0);

  const expenseTotal = expenses.reduce(
    (sum, e) => sum + Number(e.amount), 0
  );

  financeChart = new Chart(financeCanvas, {
    type: "doughnut",
    data: {
      labels: ["Faturamento", "Despesas"],
      datasets: [{
        data: [revenue, expenseTotal],
        backgroundColor: ["#16a36a", "#cdeedb"],
        borderWidth: 0,
        hoverOffset: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      plugins: { legend: { display: false } },
      animation: { animateRotate: true, duration: 1200 }
    }
  });

  $("salesEmpty").classList.toggle(
    "hidden",
    orders.length > 0
  );
}

// ========================================
// INICIALIZAÇÃO
// ========================================

checkSession();