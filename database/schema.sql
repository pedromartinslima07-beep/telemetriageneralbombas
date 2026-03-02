--
-- PostgreSQL database dump
--

\restrict R8PjlSiYpTHwIWhsouc1wun2sFhISIIbPfEkfwrEMP8DRhbV0AM2aMe6hwmZjl5

-- Dumped from database version 18.2
-- Dumped by pg_dump version 18.2

-- Started on 2026-03-02 02:28:19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 16413)
-- Name: alertas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alertas (
    id integer NOT NULL,
    device_id character varying(50) NOT NULL,
    tipo character varying(50) NOT NULL,
    mensagem text NOT NULL,
    status character varying(20) DEFAULT 'aberto'::character varying NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT now()
);


ALTER TABLE public.alertas OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16412)
-- Name: alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.alertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alertas_id_seq OWNER TO postgres;

--
-- TOC entry 5064 (class 0 OID 0)
-- Dependencies: 223
-- Name: alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.alertas_id_seq OWNED BY public.alertas.id;


--
-- TOC entry 220 (class 1259 OID 16390)
-- Name: condominios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.condominios (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    endereco text,
    bairro text,
    cidade text,
    uf character varying(2),
    responsavel text,
    telefone text,
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    device_key text
);


ALTER TABLE public.condominios OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16389)
-- Name: condominios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.condominios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.condominios_id_seq OWNER TO postgres;

--
-- TOC entry 5065 (class 0 OID 0)
-- Dependencies: 219
-- Name: condominios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.condominios_id_seq OWNED BY public.condominios.id;


--
-- TOC entry 222 (class 1259 OID 16402)
-- Name: leituras; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leituras (
    id integer NOT NULL,
    device_id character varying(50) NOT NULL,
    nivel character varying(20),
    bomba_ligada boolean,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.leituras OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16401)
-- Name: leituras_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leituras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leituras_id_seq OWNER TO postgres;

--
-- TOC entry 5066 (class 0 OID 0)
-- Dependencies: 221
-- Name: leituras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leituras_id_seq OWNED BY public.leituras.id;


--
-- TOC entry 228 (class 1259 OID 24622)
-- Name: reservatorios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservatorios (
    id integer NOT NULL,
    condominio_id integer NOT NULL,
    nome character varying(80) NOT NULL,
    tipo character varying(30),
    device_id character varying(80) NOT NULL,
    device_key character varying(200) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.reservatorios OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 24621)
-- Name: reservatorios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reservatorios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reservatorios_id_seq OWNER TO postgres;

--
-- TOC entry 5067 (class 0 OID 0)
-- Dependencies: 227
-- Name: reservatorios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reservatorios_id_seq OWNED BY public.reservatorios.id;


--
-- TOC entry 226 (class 1259 OID 16434)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    senha_hash text NOT NULL,
    role text NOT NULL,
    condominio_id integer,
    criado_em timestamp without time zone DEFAULT now(),
    CONSTRAINT usuarios_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'cliente'::text])))
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16433)
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_seq OWNER TO postgres;

--
-- TOC entry 5068 (class 0 OID 0)
-- Dependencies: 225
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- TOC entry 4881 (class 2604 OID 16416)
-- Name: alertas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alertas ALTER COLUMN id SET DEFAULT nextval('public.alertas_id_seq'::regclass);


--
-- TOC entry 4876 (class 2604 OID 16393)
-- Name: condominios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.condominios ALTER COLUMN id SET DEFAULT nextval('public.condominios_id_seq'::regclass);


--
-- TOC entry 4879 (class 2604 OID 16405)
-- Name: leituras id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leituras ALTER COLUMN id SET DEFAULT nextval('public.leituras_id_seq'::regclass);


--
-- TOC entry 4887 (class 2604 OID 24625)
-- Name: reservatorios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservatorios ALTER COLUMN id SET DEFAULT nextval('public.reservatorios_id_seq'::regclass);


--
-- TOC entry 4885 (class 2604 OID 16437)
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- TOC entry 4898 (class 2606 OID 16428)
-- Name: alertas alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_pkey PRIMARY KEY (id);


--
-- TOC entry 4892 (class 2606 OID 16398)
-- Name: condominios condominios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.condominios
    ADD CONSTRAINT condominios_pkey PRIMARY KEY (id);


--
-- TOC entry 4896 (class 2606 OID 16410)
-- Name: leituras leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT leituras_pkey PRIMARY KEY (id);


--
-- TOC entry 4907 (class 2606 OID 24638)
-- Name: reservatorios reservatorios_device_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservatorios
    ADD CONSTRAINT reservatorios_device_id_key UNIQUE (device_id);


--
-- TOC entry 4909 (class 2606 OID 24636)
-- Name: reservatorios reservatorios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservatorios
    ADD CONSTRAINT reservatorios_pkey PRIMARY KEY (id);


--
-- TOC entry 4902 (class 2606 OID 16450)
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 4904 (class 2606 OID 16448)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 4893 (class 1259 OID 16480)
-- Name: idx_condominios_device_key_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_condominios_device_key_unique ON public.condominios USING btree (device_key);


--
-- TOC entry 4894 (class 1259 OID 16479)
-- Name: idx_device_key_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_device_key_unique ON public.condominios USING btree (device_key);


--
-- TOC entry 4905 (class 1259 OID 24644)
-- Name: idx_reservatorios_condominio_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservatorios_condominio_id ON public.reservatorios USING btree (condominio_id);


--
-- TOC entry 4900 (class 1259 OID 16456)
-- Name: idx_usuarios_condominio_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usuarios_condominio_id ON public.usuarios USING btree (condominio_id);


--
-- TOC entry 4899 (class 1259 OID 16431)
-- Name: uniq_alerta_aberto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uniq_alerta_aberto ON public.alertas USING btree (device_id, tipo) WHERE ((status)::text = 'aberto'::text);


--
-- TOC entry 4911 (class 2606 OID 24639)
-- Name: reservatorios reservatorios_condominio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservatorios
    ADD CONSTRAINT reservatorios_condominio_id_fkey FOREIGN KEY (condominio_id) REFERENCES public.condominios(id) ON DELETE CASCADE;


--
-- TOC entry 4910 (class 2606 OID 16451)
-- Name: usuarios usuarios_condominio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_condominio_id_fkey FOREIGN KEY (condominio_id) REFERENCES public.condominios(id) ON DELETE SET NULL;


-- Completed on 2026-03-02 02:28:20

--
-- PostgreSQL database dump complete
--

\unrestrict R8PjlSiYpTHwIWhsouc1wun2sFhISIIbPfEkfwrEMP8DRhbV0AM2aMe6hwmZjl5

