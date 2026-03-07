#!/bin/bash

# Logistix — Sequential Git Commit History
# Run this from the project root to stage and commit in proper order.
# Adjust as needed if some files don't exist yet.

# 1. Initial project scaffold
git add package.json tsconfig.json next.config.ts postcss.config.mjs .gitignore .prettierrc eslint.config.mjs components.json next-env.d.ts
git add backend/package.json backend/tsconfig.json backend/.gitignore
git add src/app/layout.tsx src/app/globals.css src/app/favicon.ico
git commit -m "init:rest-scaffold"

# 2. Shadcn UI + providers + sidebar
git add src/components/ui/
git add src/components/providers/ReactQueryProvider.tsx
git add src/components/sidebar/SideNav.tsx src/components/sidebar/config.tsx
git add src/store/atom.ts
git add src/lib/utils.ts
git commit -m "ui:added-shadcn-components-and-sidenav"

# 3. Backend prisma schema + seed + config
git add backend/prisma/schema.prisma backend/prisma/seed.ts
git add backend/src/config/env.ts backend/src/config/database.ts
git add backend/src/middleware/ backend/src/utils/ backend/src/schemas/
git add backend/src/index.ts
git commit -m "server:added-prisma-schema-seed-and-config"

# 4. Auth flow + sign-in page
git add backend/src/controllers/authController.ts backend/src/routes/authRoutes.ts
git add src/app/sign-in/page.tsx src/app/sign-up/page.tsx
git add src/hooks/useAuth.ts src/hooks/useUser.ts
git add src/lib/api/client.ts src/lib/config.ts src/lib/types.ts
git add src/middleware.ts
git commit -m "web:implemented-auth-flow-and-sign-in"

# 5. Backend shipment + warehouse + admin routes
git add backend/src/controllers/shipmentController.ts backend/src/routes/shipmentRoutes.ts
git add backend/src/controllers/warehouseController.ts backend/src/routes/warehouseRoutes.ts
git add backend/src/controllers/adminController.ts backend/src/routes/adminRoutes.ts
git add backend/src/routes/logsRoutes.ts backend/src/routes/index.ts
git commit -m "server:added-shipment-warehouse-admin-routes"

# 6. Frontend hooks + types for data fetching
git add src/hooks/useShipments.ts src/hooks/useWarehouses.ts
git add src/hooks/useDashboard.ts src/hooks/useIncidents.ts src/hooks/useLogs.ts
git commit -m "web:implemented-react-query-hooks"

# 7. Main layout + consumer dashboard + create shipment
git add src/app/\(main\)/layout.tsx
git add src/app/\(main\)/page.tsx
git commit -m "ui:added-consumer-dashboard-with-create-shipment"

# 8. Admin ops dashboard with inline shipments and warehouses
git add src/app/\(main\)/admin/page.tsx
git commit -m "ui:added-admin-ops-dashboard"

# 9. Logs page with signal trigger cards
git add src/app/\(main\)/admin/logs/page.tsx
git commit -m "ui:added-logs-page-with-agent-signal-triggers"

# 10. Live map tracking pages (admin + consumer)
git add src/app/\(main\)/admin/map/page.tsx
git add src/app/\(main\)/track/page.tsx
git commit -m "ui:added-mapbox-live-tracking-pages"


echo "Done. All commits staged and committed."
