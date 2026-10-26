import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './components/RequireRole';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { homePathFor, useAuth } from './lib/auth';
import Landing from './pages/Landing';
import { Login, Register } from './pages/AuthPages';
import PublicDriver from './pages/PublicDriver';
import Settings from './pages/Settings';
import BookingDetail from './pages/BookingDetail';
import CustomerHome from './pages/customer/CustomerHome';
import RequestRide from './pages/customer/RequestRide';
import CustomerBookings from './pages/customer/CustomerBookings';
import DriverDashboard from './pages/driver/DriverDashboard';
import DriverProfilePage from './pages/driver/DriverProfilePage';
import DriverShare from './pages/driver/DriverShare';
import DriverNetwork from './pages/driver/DriverNetwork';
import DriverJobs from './pages/driver/DriverJobs';
import AdminConsole from './pages/admin/AdminConsole';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to={homePathFor(user.roles)} replace /> : <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<Shell />}>
        {/* Shareable driver link / QR target; works signed-out too. */}
        <Route path="/d/:code" element={<PublicDriver />} />

        <Route element={<RequireRole role="CUSTOMER" />}>
          <Route path="/app" element={<CustomerHome />} />
          <Route path="/app/request/:driverId" element={<RequestRide />} />
          <Route path="/app/bookings" element={<CustomerBookings />} />
        </Route>

        <Route element={<RequireRole role="DRIVER" />}>
          <Route path="/driver" element={<DriverDashboard />} />
          <Route path="/driver/jobs" element={<DriverJobs />} />
          <Route path="/driver/network" element={<DriverNetwork />} />
          <Route path="/driver/share" element={<DriverShare />} />
          <Route path="/driver/profile" element={<DriverProfilePage />} />
        </Route>

        <Route element={<RequireRole role="ADMIN" />}>
          <Route path="/admin" element={<AdminConsole />} />
        </Route>

        <Route element={<RequireRole />}>
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
