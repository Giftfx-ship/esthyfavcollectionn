const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected to Esthyfav'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ========== SCHEMAS ==========
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: String, required: true },
    category: { type: String, required: true },
    imageUrl: { type: String },
    isBestseller: { type: Boolean, default: false },
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    icon: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true }
});

const brandSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String },
    imageUrl: { type: String },
    updatedAt: { type: Date, default: Date.now }
});

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, default: 'Super Admin' }
});

const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', categorySchema);
const BrandSetting = mongoose.model('BrandSetting', brandSettingSchema);
const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
const Admin = mongoose.model('Admin', adminSchema);

// ========== FILE UPLOAD ==========
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ========== AUTH MIDDLEWARE ==========
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.adminId = decoded.id;
        next();
    });
};

// ========== PUBLIC ROUTES ==========
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/bestsellers', async (req, res) => {
    try {
        const products = await Product.find({ isBestseller: true }).limit(8);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true });
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/brand-settings', async (req, res) => {
    try {
        const settings = await BrandSetting.find();
        const settingsObj = {};
        settings.forEach(s => { settingsObj[s.key] = s.value || s.imageUrl; });
        res.json(settingsObj);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        const contact = new ContactMessage({ name, email, phone, message });
        await contact.save();
        res.json({ success: true, message: '✅ Message sent! We will reply within 24 hours.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN AUTH ==========
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(401).json({ error: 'Admin not found' });
        
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) return res.status(401).json({ error: 'Wrong password' });
        
        const token = jwt.sign({ id: admin._id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, admin: { email: admin.email, name: admin.name } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN PRODUCTS ==========
app.get('/api/admin/products', verifyToken, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/products', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, price, category, isBestseller, description } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const product = new Product({ name, price, category, imageUrl, isBestseller: isBestseller === 'true', description });
        await product.save();
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/products/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, price, category, isBestseller, description } = req.body;
        const updateData = { name, price, category, isBestseller: isBestseller === 'true', description };
        if (req.file) updateData.imageUrl = `/uploads/${req.file.filename}`;
        const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/products/:id', verifyToken, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN CATEGORIES ==========
app.get('/api/admin/categories', verifyToken, async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/categories', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, slug, icon } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const category = new Category({ name, slug, icon, imageUrl });
        await category.save();
        res.json({ success: true, category });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/categories/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, slug, icon, isActive } = req.body;
        const updateData = { name, slug, icon, isActive: isActive === 'true' };
        if (req.file) updateData.imageUrl = `/uploads/${req.file.filename}`;
        const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, category });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/categories/:id', verifyToken, async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN BRAND SETTINGS ==========
app.get('/api/admin/brand-settings', verifyToken, async (req, res) => {
    try {
        const settings = await BrandSetting.find();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/brand-settings/:key', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { key } = req.params;
        const value = req.body.value || (req.file ? `/uploads/${req.file.filename}` : null);
        const setting = await BrandSetting.findOneAndUpdate(
            { key },
            { key, value, imageUrl: req.file ? `/uploads/${req.file.filename}` : null, updatedAt: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true, setting });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN CONTACT MESSAGES ==========
app.get('/api/admin/contacts', verifyToken, async (req, res) => {
    try {
        const messages = await ContactMessage.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/contacts/:id/read', verifyToken, async (req, res) => {
    try {
        await ContactMessage.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/contacts/:id', verifyToken, async (req, res) => {
    try {
        await ContactMessage.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN STATS ==========
app.get('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const products = await Product.countDocuments();
        const categories = await Category.countDocuments();
        const messages = await ContactMessage.countDocuments();
        const unread = await ContactMessage.countDocuments({ isRead: false });
        const bestsellers = await Product.countDocuments({ isBestseller: true });
        res.json({ products, categories, messages, unread, bestsellers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== INITIALIZE DATABASE ==========
async function initDatabase() {
    // Create admin with password "devgift1"
    const existingAdmin = await Admin.findOne({ email: 'admin@esthyfav.com' });
    if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash('devgift1', 10);
        await Admin.create({ email: 'admin@esthyfav.com', password: hashedPassword, name: 'Esthyfav Admin' });
        console.log('✅ Admin created: admin@esthyfav.com / devgift1');
    }

    // Create default categories
    const categories = [
        { name: 'Unisex Wears', slug: 'unisex', icon: '👕' },
        { name: 'Stylish Bags', slug: 'bags', icon: '👜' },
        { name: 'Comfy Shoes', slug: 'shoes', icon: '👟' },
        { name: 'Girly Essentials', slug: 'girly', icon: '🎀' },
        { name: 'Household Items', slug: 'household', icon: '🏠' }
    ];
    for (const cat of categories) {
        const exists = await Category.findOne({ slug: cat.slug });
        if (!exists) await Category.create(cat);
    }
    console.log('✅ Categories ready');

    // Create default brand settings
    const defaultSettings = ['hero_image', 'logo', 'site_title', 'contact_phone', 'contact_email'];
    for (const key of defaultSettings) {
        const exists = await BrandSetting.findOne({ key });
        if (!exists) {
            let value = '';
            if (key === 'site_title') value = 'Esthyfav Collection';
            if (key === 'contact_phone') value = '+234 705 898 7882';
            if (key === 'contact_email') value = 'famousmichelle915@gmail.com';
            await BrandSetting.create({ key, value });
        }
    }
    console.log('✅ Brand settings ready');

    // Add sample products if none exist
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
        const sampleProducts = [
            { name: 'Premium Denim Jacket', price: '₦25,000', category: 'Unisex Wears', isBestseller: true },
            { name: 'Leather Shoulder Bag', price: '₦35,000', category: 'Stylish Bags', isBestseller: true },
            { name: 'Classic White Sneakers', price: '₦22,000', category: 'Comfy Shoes', isBestseller: true },
            { name: 'Luxury Skincare Set', price: '₦15,000', category: 'Girly Essentials', isBestseller: false },
            { name: 'Premium Cookware Set', price: '₦45,000', category: 'Household Items', isBestseller: false },
            { name: 'Oversized Hoodie', price: '₦28,000', category: 'Unisex Wears', isBestseller: true },
            { name: 'Crossbody Mini Bag', price: '₦18,000', category: 'Stylish Bags', isBestseller: false },
            { name: 'Comfort Slides', price: '₦12,000', category: 'Comfy Shoes', isBestseller: true }
        ];
        await Product.insertMany(sampleProducts);
        console.log('✅ Sample products added');
    }
}

app.listen(process.env.PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
    await initDatabase();
    console.log(`✨ Esthyfav Collection is LIVE!`);
    console.log(`📊 Admin Login: http://localhost:${process.env.PORT}/admin`);
    console.log(`🔐 Email: admin@esthyfav.com | Password: devgift1`);
});
