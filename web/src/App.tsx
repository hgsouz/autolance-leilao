import { Link, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { RequireAuth } from '@/components/Guards'
import Audit from '@/pages/Audit'
import { Login, Register } from '@/pages/AuthPages'
import Home from '@/pages/Home'
import LotRoom from '@/pages/LotRoom'
import MyBids from '@/pages/MyBids'
import Panel from '@/pages/Panel'
import ReceiptPage from '@/pages/ReceiptPage'
import Wallet from '@/pages/Wallet'

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="font-display text-7xl font-extrabold text-numeral">404</p>
      <p className="mt-2 text-lg font-bold">Página não encontrada</p>
      <Link to="/" className="btn-primary mt-6">
        Voltar à vitrine
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="lotes/:id" element={<LotRoom />} />
        <Route path="auditoria/:id" element={<Audit />} />
        <Route path="comprovante/:code" element={<ReceiptPage />} />
        <Route path="entrar" element={<Login />} />
        <Route path="cadastro" element={<Register />} />
        <Route path="carteira" element={<RequireAuth role="bidder"><Wallet /></RequireAuth>} />
        <Route path="meus-arremates" element={<RequireAuth role="bidder"><MyBids /></RequireAuth>} />
        <Route path="painel" element={<RequireAuth role="auctioneer"><Panel /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
