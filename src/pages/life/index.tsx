import { Navigate, Route, Routes } from 'react-router-dom'
import { DatesPage } from './Dates'
import { ListDetail, ListsPage } from './Lists'
import { LifeOverview } from './Overview'
import { VaultPage } from './Vault'

/** Daily Life Organizer — mounted at `life/*`. */
export function LifePage() {
  return (
    <Routes>
      <Route index element={<LifeOverview />} />
      <Route path="lists" element={<ListsPage />} />
      <Route path="lists/:id" element={<ListDetail />} />
      <Route path="dates" element={<DatesPage />} />
      <Route path="vault" element={<VaultPage />} />
      <Route path="*" element={<Navigate to="/life" replace />} />
    </Routes>
  )
}
