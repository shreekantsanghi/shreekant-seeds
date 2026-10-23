import { useCopy } from "@/lib/store-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCustomerAddress,
  getCustomerProfile,
  listCustomerAddresses,
  saveCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerProfile,
  type CustomerAddress,
  type CustomerProfile,
} from "@/lib/customer-account.functions";

export const customerProfileKey = ["customer-profile"] as const;
export const customerAddressesKey = ["customer-addresses"] as const;

export function useCustomerProfile() {
  const fetchProfile = useServerFn(getCustomerProfile);
  return useQuery<CustomerProfile>({
    queryKey: customerProfileKey,
    queryFn: () => fetchProfile(),
    retry: false,
    staleTime: 30_000,
  });
}

export function useUpdateCustomerProfile() {
  const update = useServerFn(updateCustomerProfile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullName: string; phone: string }) => update({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerProfileKey }),
  });
}

export function useCustomerAddresses() {
  const list = useServerFn(listCustomerAddresses);
  return useQuery<CustomerAddress[]>({
    queryKey: customerAddressesKey,
    queryFn: () => list(),
    retry: false,
  });
}

export type AddressInput = {
  id?: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

export function useSaveCustomerAddress() {
  const save = useServerFn(saveCustomerAddress);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddressInput) => save({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerAddressesKey }),
  });
}

export function useSetDefaultAddress() {
  const setDefault = useServerFn(setDefaultCustomerAddress);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setDefault({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerAddressesKey }),
  });
}

export function useDeleteCustomerAddress() {
  const remove = useServerFn(deleteCustomerAddress);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerAddressesKey }),
  });
}

/** Customer sign-out: clears cached private data, ends the session, returns to the store. */
export function useCustomerSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const copy = useCopy();
  return async () => {
    if (!window.confirm(copy({ hi: "क्या आप सच में लॉगआउट करना चाहते हैं?", en: "Are you sure you want to sign out?" }))) return;
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };
}
