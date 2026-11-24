import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../../lib/api';
import type { DriverBrief } from '../../lib/types';
import { Empty, ErrorBox, Modal, Spinner, vehicleLine } from '../ui';

/** Busy driver picks an eligible colleague from their trusted network. */
export function ReferDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['referral-candidates', bookingId],
    queryFn: () => get<DriverBrief[]>(`/referrals/candidates/${bookingId}`),
  });
  const refer = useMutation({
    mutationFn: (candidateId: string) => post('/referrals', { bookingId, candidateId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
      onClose();
    },
  });

  return (
    <Modal title="Refer this job to a colleague" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Only verified, available drivers in your trusted network are shown. They must accept, then
        the customer must approve.
      </p>
      {q.isLoading ? (
        <Spinner />
      ) : q.data?.length ? (
        <ul className="space-y-2">
          {q.data.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-slate-500">
                  {vehicleLine(d.driverProfile?.vehicles?.[0])}
                </p>
              </div>
              <button
                className="btn-primary"
                disabled={refer.isPending}
                onClick={() => refer.mutate(d.id)}
              >
                Refer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title="No eligible colleagues right now"
          hint="Add trusted drivers from the Network tab, or decline the request."
        />
      )}
      <ErrorBox error={q.error ?? refer.error} />
    </Modal>
  );
}
