"use client";
import { receptionistAuthApi } from "@/lib/api/client";
import type { Receptionist } from "@/lib/api/types";
import { makeAuth } from "./makeAuth";

const { Provider, useAuthValue } = makeAuth<Receptionist>(receptionistAuthApi, "useReceptionistAuth");
export const ReceptionistAuthProvider = Provider;
export const useReceptionistAuth = useAuthValue;
