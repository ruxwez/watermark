import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { mount } from 'svelte';
import App from './App.svelte';
mount(App, { target: document.getElementById('app') });
