import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { getDeviceId } from "../api";


// Make sure the device ID exists
// as soon as authentication context starts.
getDeviceId();


const AuthContext =
  createContext(null);


export function AuthProvider({
  children,
}) {

  const [token, setToken] =
    useState(
      sessionStorage.getItem(
        "railvinyas_token"
      )
    );

  const [role, setRole] =
    useState(
      sessionStorage.getItem(
        "railvinyas_role"
      )
    );

  const [name, setName] =
    useState(
      sessionStorage.getItem(
        "railvinyas_name"
      )
    );


  function loginSuccess(
    authResponse
  ) {
    setToken(authResponse.token);
    setRole(authResponse.role);
    setName(authResponse.name);

    sessionStorage.setItem(
      "railvinyas_token",
      authResponse.token
    );

    sessionStorage.setItem(
      "railvinyas_role",
      authResponse.role
    );

    sessionStorage.setItem(
      "railvinyas_name",
      authResponse.name
    );
  }


  function logout() {

    setToken(null);
    setRole(null);
    setName(null);

    sessionStorage.removeItem(
      "railvinyas_token"
    );

    sessionStorage.removeItem(
      "railvinyas_role"
    );

    sessionStorage.removeItem(
      "railvinyas_name"
    );
  }


  const value = useMemo(
    () => ({
      token,
      role,
      name,
      isAuthenticated:
        Boolean(token),
      loginSuccess,
      logout,
    }),
    [
      token,
      role,
      name,
    ]
  );


  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {

  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}