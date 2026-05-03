import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth.api';
import toast from 'react-hot-toast';
import Spinner from '../../components/common/Spinner';
import { FiBriefcase, FiSave } from 'react-icons/fi';
import './CompanySetupPage.css';

const emptyForm = {
  name: '',
  gstin: '',
  pan: '',
  billingAddress: { street: '', city: '', state: '', pincode: '' },
  shippingAddresses: [{ street: '', city: '', state: '', pincode: '' }],
};

export default function CompanySetupPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [isEdit, setIsEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const { data } = await authApi.getCompany();
        if (data.data.company) {
          const c = data.data.company;
          setForm({
            name: c.name || '',
            gstin: c.gstin || '',
            pan: c.pan || '',
            billingAddress: c.billingAddress || emptyForm.billingAddress,
            shippingAddresses: c.shippingAddresses?.length ? c.shippingAddresses : emptyForm.shippingAddresses,
          });
          setIsEdit(true);
        }
      } catch { }
      setLoading(false);
    };
    fetchCompany();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddressChange = (type, field, value, index) => {
    if (type === 'billing') {
      setForm({ ...form, billingAddress: { ...form.billingAddress, [field]: value } });
    } else {
      const addrs = [...form.shippingAddresses];
      addrs[index] = { ...addrs[index], [field]: value };
      setForm({ ...form, shippingAddresses: addrs });
    }
  };

  const addShippingAddress = () => {
    setForm({
      ...form,
      shippingAddresses: [...form.shippingAddresses, { street: '', city: '', state: '', pincode: '' }],
    });
  };

  const removeShippingAddress = (index) => {
    if (form.shippingAddresses.length <= 1) return;
    setForm({
      ...form,
      shippingAddresses: form.shippingAddresses.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await authApi.updateCompany(form);
      } else {
        await authApi.createCompany(form);
      }
      await refreshUser();
      toast.success(isEdit ? 'Company updated' : 'Company registered');
      navigate('/products');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    }
    setSaving(false);
  };

  if (loading) return <Spinner />;

  return (
    <div className="company-setup-page">
      <h1><FiBriefcase /> {isEdit ? 'Update Company' : 'Register Company'}</h1>
      <p className="company-subtitle">
        {isEdit ? 'Update your company details below.' : 'Set up your company to start placing orders.'}
      </p>

      <form className="company-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Company Info</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Company Name *</label>
              <input name="name" value={form.name} onChange={handleChange} required className="form-input" />
            </div>
          </div>
          <div className="form-row two-col">
            <div className="form-group">
              <label>GSTIN</label>
              <input name="gstin" value={form.gstin} onChange={handleChange} placeholder="22AAAAA0000A1Z5" className="form-input" />
            </div>
            <div className="form-group">
              <label>PAN</label>
              <input name="pan" value={form.pan} onChange={handleChange} placeholder="AAAAA0000A" className="form-input" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Billing Address</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Street *</label>
              <input value={form.billingAddress.street} onChange={(e) => handleAddressChange('billing', 'street', e.target.value)} required className="form-input" />
            </div>
          </div>
          <div className="form-row three-col">
            <div className="form-group">
              <label>City *</label>
              <input value={form.billingAddress.city} onChange={(e) => handleAddressChange('billing', 'city', e.target.value)} required className="form-input" />
            </div>
            <div className="form-group">
              <label>State *</label>
              <input value={form.billingAddress.state} onChange={(e) => handleAddressChange('billing', 'state', e.target.value)} required className="form-input" />
            </div>
            <div className="form-group">
              <label>Pincode *</label>
              <input value={form.billingAddress.pincode} onChange={(e) => handleAddressChange('billing', 'pincode', e.target.value)} required className="form-input" />
            </div>
          </div>
        </fieldset>

        {form.shippingAddresses.map((addr, i) => (
          <fieldset key={i}>
            <legend>
              Shipping Address {i + 1}
              {form.shippingAddresses.length > 1 && (
                <button type="button" className="remove-addr-btn" onClick={() => removeShippingAddress(i)}>Remove</button>
              )}
            </legend>
            <div className="form-row">
              <div className="form-group">
                <label>Street *</label>
                <input value={addr.street} onChange={(e) => handleAddressChange('shipping', 'street', e.target.value, i)} required className="form-input" />
              </div>
            </div>
            <div className="form-row three-col">
              <div className="form-group">
                <label>City *</label>
                <input value={addr.city} onChange={(e) => handleAddressChange('shipping', 'city', e.target.value, i)} required className="form-input" />
              </div>
              <div className="form-group">
                <label>State *</label>
                <input value={addr.state} onChange={(e) => handleAddressChange('shipping', 'state', e.target.value, i)} required className="form-input" />
              </div>
              <div className="form-group">
                <label>Pincode *</label>
                <input value={addr.pincode} onChange={(e) => handleAddressChange('shipping', 'pincode', e.target.value, i)} required className="form-input" />
              </div>
            </div>
          </fieldset>
        ))}

        <button type="button" className="btn btn-outline add-addr-btn" onClick={addShippingAddress}>
          + Add Shipping Address
        </button>

        <button type="submit" disabled={saving} className="btn btn-primary btn-lg">
          <FiSave /> {saving ? 'Saving...' : (isEdit ? 'Update Company' : 'Register Company')}
        </button>
      </form>
    </div>
  );
}
