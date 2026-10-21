import { Navigate, Route, Routes } from 'react-router-dom'
import { ClientDetail } from './ClientDetail'
import { ClientsPage } from './Clients'
import { InvoicesPage } from './Invoices'
import { BusinessOverview } from './Overview'
import { ProjectDetail } from './ProjectDetail'
import { ProjectsPage } from './Projects'
import { BusinessSheetHost } from './sheets'

/**
 * Business & Work manager, mounted at `business/*`:
 * /business (overview) · /business/projects[/:id] · /business/clients[/:id] · /business/invoices
 */
export function BusinessPage() {
  return (
    <>
      <Routes>
        <Route index element={<BusinessOverview />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="*" element={<Navigate to="/business" replace />} />
      </Routes>
      <BusinessSheetHost />
    </>
  )
}
