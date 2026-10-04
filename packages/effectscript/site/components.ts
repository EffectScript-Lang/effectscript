import { defineComponents } from "blume"
import Footer from "effectscript/blume/components/Footer.astro"
import Logo from "effectscript/blume/components/Logo.astro"
import PageHeader from "effectscript/blume/components/PageHeader.astro"

export default defineComponents({ layout: { Footer, Logo, PageHeader } })
