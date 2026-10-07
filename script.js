const PRIMARY_API_URL = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_API_URL = "https://api.frankfurter.app/latest?from=USD&to=EGP";
const REQUEST_TIMEOUT_MS = 10_000;

const rateValue = document.querySelector("#rate-value");
const updatedAt = document.querySelector("#updated-at span");
const sourceNote = document.querySelector("#source-note");
const fetchMessage = document.querySelector("#fetch-message");
const refreshButton = document.querySelector("#refresh-button");
const usdInput = document.querySelector("#usd-amount");
const egpInput = document.querySelector("#egp-amount");
const themeToggle = document.querySelector("#theme-toggle");
const converterHint = document.querySelector("#converter-hint");

// يتبع الحقل الآخر آخر عملة عدّلها المستخدم لتعمل الحاسبة في الاتجاهين.
let currentRate = null;
let lastEditedCurrency = "usd";

const rateFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`استجاب مصدر الأسعار برمز ${response.status}.`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchPrimaryRate() {
  const data = await fetchJson(PRIMARY_API_URL);
  if (
    data.result !== "success" ||
    !Number.isFinite(data.rates?.EGP) ||
    data.rates.EGP <= 0
  ) {
    throw new Error("تعذّر التحقق من سعر الصرف لدى المصدر الأساسي.");
  }

  return {
    rate: data.rates.EGP,
    source: "ExchangeRate-API",
    sourceDate: data.time_last_update_utc,
  };
}

async function fetchFallbackRate() {
  const data = await fetchJson(FALLBACK_API_URL);
  if (!Number.isFinite(data.rates?.EGP) || data.rates.EGP <= 0) {
    throw new Error("المصدر البديل لا يعرض سعراً صالحاً للجنيه المصري.");
  }

  return {
    rate: data.rates.EGP,
    source: "Frankfurter",
    sourceDate: data.date,
  };
}

function formatSourceDate(sourceDate) {
  if (!sourceDate) {
    return "";
  }

  const parsedDate = new Date(sourceDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "Africa/Cairo",
  }).format(parsedDate);
}

function updateConverter() {
  if (currentRate === null) {
    egpInput.value = "";
    return;
  }

  const editedInput = lastEditedCurrency === "usd" ? usdInput : egpInput;
  const otherInput = lastEditedCurrency === "usd" ? egpInput : usdInput;
  const amount = Number(editedInput.value);

  if (editedInput.value.trim() === "" || !Number.isFinite(amount) || amount < 0) {
    otherInput.value = "";
    converterHint.textContent = "أدخل مبلغاً موجباً أو صفراً لحساب التحويل.";
    return;
  }

  const convertedAmount =
    lastEditedCurrency === "usd" ? amount * currentRate : amount / currentRate;
  otherInput.value = convertedAmount.toFixed(2);
  converterHint.textContent = `1 دولار أمريكي = ${rateFormatter.format(currentRate)} جنيه مصري.`;
}

function displayRate(rate, source, sourceDate, usedFallback) {
  currentRate = rate;
  rateValue.textContent = rateFormatter.format(rate);
  updatedAt.textContent = `آخر تحقق: ${new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date())}`;

  const sourceDay = formatSourceDate(sourceDate);
  sourceNote.textContent = sourceDay
    ? `المصدر: ${source}${usedFallback ? " (احتياطي)" : ""} · تاريخ السعر لدى المصدر: ${sourceDay}.`
    : `المصدر: ${source}${usedFallback ? " (احتياطي)" : ""}.`;

  fetchMessage.textContent = usedFallback
    ? "تعذّر الوصول للمصدر الأساسي؛ تم جلب السعر من المصدر البديل."
    : "";
  updateConverter();
}

async function refreshRate() {
  refreshButton.disabled = true;
  refreshButton.classList.add("is-loading");
  fetchMessage.textContent = "";

  try {
    try {
      const result = await fetchPrimaryRate();
      displayRate(result.rate, result.source, result.sourceDate, false);
    } catch (primaryError) {
      // عند تعذر المصدر الأساسي أو عدم صلاحية رده، ننتقل تلقائياً إلى البديل.
      try {
        const result = await fetchFallbackRate();
        displayRate(result.rate, result.source, result.sourceDate, true);
      } catch (fallbackError) {
        const reason =
          fallbackError instanceof Error
            ? fallbackError.message
            : "تعذّر الاتصال بمصدر الأسعار البديل.";
        if (currentRate === null) {
          rateValue.textContent = "غير متاح";
          updatedAt.textContent = "تعذّر تحديث السعر";
        }
        fetchMessage.textContent = `تعذّر جلب السعر من المصدرين. ${reason}`;
        console.error("فشل مصدرا أسعار الصرف.", { primaryError, fallbackError });
      }
    }
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-loading");
  }
}

usdInput.addEventListener("input", () => {
  lastEditedCurrency = "usd";
  updateConverter();
});

egpInput.addEventListener("input", () => {
  lastEditedCurrency = "egp";
  updateConverter();
});

refreshButton.addEventListener("click", refreshRate);

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن",
  );
});

usdInput.value = "1";
refreshRate();
