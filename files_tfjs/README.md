# Smart Carrier Selector — India 🇮🇳

ML-powered carrier recommendation service for Indian shipments.  
Built with TensorFlow.js + Express. Integrates directly with your n8n AI Agent.

## Supported Carriers
| Carrier | Code | Strengths |
|---|---|---|
| Delhivery Express | DLX | Metro-to-metro, COD, express delivery |
| BlueDart | BDT | High-value, fragile, premium express |
| Ekart Logistics | EKT | Tier-2/3 coverage, bulk, COD |
| Shadowfax | SFX | Hyperlocal, same-day metro, last-mile |
| XpressBees | XPB | Metro express, same-day, Tier-1→2 |

---

## Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Generate synthetic training data
```bash
npm run generate
# → Creates data/train.json (12,000 samples) and data/test.json (3,000 samples)
```

### 3. Train the model
```bash
npm run train
# → Trains neural network, saves to ./model/
# → Expect ~90%+ accuracy
```

### 4. Start the server
```bash
npm start
# → Running on http://localhost:3500
```

### One-liner (first time setup)
```bash
npm run setup
```

---

## API Reference

### POST `/api/carrier/select`
Get the best carrier for a shipment.

**Request Body:**
```json
{
  "originCity":     "Mumbai",
  "destCity":       "Jaipur",
  "weightKg":       2.5,
  "valueInr":       4500,
  "shipmentType":   "cod",
  "priority":       "standard",
  "month":          7
}
```

**Fields:**
| Field | Type | Required | Values |
|---|---|---|---|
| originCity | string | ✓ | See GET /api/cities |
| destCity | string | ✓ | See GET /api/cities |
| weightKg | number | ✓ | 0.1 – 50 |
| valueInr | number | ✓ | 100 – 500000 |
| shipmentType | string | ✓ | standard, express, fragile, cod, bulk |
| priority | string | ✓ | standard, express, same_day |
| month | integer | ✗ | 1–12 (defaults to current month) |

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendation": {
      "carrier":           "Ecom Express",
      "code":              "ECX",
      "confidence":        72.4,
      "estimatedDays":     4,
      "estimatedCostInr":  243,
      "codSupport":        true
    },
    "alternatives": [
      { "carrier": "Delhivery", "code": "DLV", "confidence": 14.2, "estimatedDays": 3, ... },
      { "carrier": "DTDC",      "code": "DTC", "confidence": 8.1,  "estimatedDays": 4, ... }
    ],
    "routeInfo": {
      "originCity":  "Mumbai",
      "destCity":    "Jaipur",
      "distanceKm":  1147,
      "originTier":  1,
      "destTier":    2,
      "isMonsoon":   true
    }
  }
}
```

---

### POST `/api/carrier/compare`
Batch carrier selection for multiple shipments (max 20).

**Request:**
```json
{
  "shipments": [
    { "id": "CASE001", "originCity": "Delhi", "destCity": "Shimla", "weightKg": 1.2, "valueInr": 800, "shipmentType": "standard", "priority": "standard" },
    { "id": "CASE002", "originCity": "Bengaluru", "destCity": "Chennai", "weightKg": 5.0, "valueInr": 75000, "shipmentType": "fragile", "priority": "express" }
  ]
}
```

---

### GET `/api/carriers`
List all carriers with their strengths.

### GET `/api/cities`
List all 40+ supported Indian cities with tier classification.

### GET `/health`
Service health check.

---

## n8n Integration

Add an **HTTP Request** node in your AI Agent's tool list:

```
Name:    Select Best Carrier
Method:  POST
URL:     http://localhost:3500/api/carrier/select
Body:    {{ JSON.stringify($input) }}
```

**Agent Tool Description (paste into n8n):**
```
Selects the optimal shipping carrier for an Indian shipment.
Required fields: originCity, destCity, weightKg (0.1-50), valueInr (100-500000),
shipmentType (standard|express|fragile|cod|bulk), priority (standard|express|same_day).
Returns recommended carrier with confidence score, estimated delivery days, cost in INR,
and COD availability. Use GET /api/cities for valid city names.
```

---

## Model Architecture
- **Type:** Multi-class classification (7 classes)
- **Input:** 8 normalized features
- **Hidden layers:** Dense(64) → BN → Dropout(0.2) → Dense(128) → BN → Dropout(0.2) → Dense(64)
- **Output:** Softmax over 7 carriers
- **Training data:** 15,000 synthetic Indian shipments
- **Expected accuracy:** 88–93%

## Features Used
| Feature | Description |
|---|---|
| weight_kg | Shipment weight (normalized) |
| distance_km | Haversine distance between cities |
| value_inr | Declared value |
| origin_tier | Metro(1) / Tier-2(2) / Rural(3) |
| dest_tier | Metro(1) / Tier-2(2) / Rural(3) |
| shipment_type | standard / express / fragile / cod / bulk |
| priority | standard / express / same_day |
| is_monsoon | June–September = 1 |
